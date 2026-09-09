import type { Asset, Citation, Snapshot, SourceMetrics } from '../types.js'
import { githubRepoFromUrl, loadCurationFile } from './curation.js'
import type { CuratedEntry } from './curation.js'
import { findDoi, fetchDataciteCitations } from './datacite.js'
import { fetchGithub } from './github.js'
import { fetchHfAsset, fetchHfSearch, fetchHfTop } from './hf.js'
import type { HfAssetRecord } from './hf.js'
import { fetchModelscopeMirror } from './modelscope.js'
import type { FetchEnv } from './util.js'

/**
 * Multi-source refresh pipeline: Hugging Face is the primary record
 * (identity, evidence attributes, and its own metrics); ModelScope mirrors,
 * DataCite citations, and curated GitHub repos contribute additional
 * per-source metric groups. An asset keeps exactly the sources that
 * answered — a failed adapter never fabricates data, and single-source
 * assets remain explicitly marked downstream.
 */
export interface PipelineOptions {
  /** Final asset count (the seed ships 25). */
  limit: number
  /** How many top-downloads candidates to consider beyond the famous list. */
  topCount: number
  /** Recognizable candidate ids tried first (skipped when gated/absent). */
  famous: readonly string[]
  /**
   * Extra catalog queries (keyword search or tag filter on Hugging Face).
   * Default order: famous → queries → top-downloads. With `queriesFirst`,
   * explicit queries lead (the user asked for a domain-focused catalog).
   */
  queries: readonly CatalogQuery[]
  /** Try the catalog queries before the famous list. */
  queriesFirst?: boolean
  /**
   * P0 candidate filter: exact-token blocklist. A discovered candidate whose
   * id contains a blocklisted token is rejected BEFORE any fetch; the block
   * is logged with the rule and the triggering word. The famous list is
   * curator-intent and is never filtered.
   */
  block?: readonly string[]
  /**
   * P0 candidate filter: token allowlist. When non-empty, a discovered
   * candidate must contain at least one allowlisted token to pass.
   */
  allow?: readonly string[]
  /**
   * Curated dataset→repository mapping for GitHub signals. Only entries with
   * an unambiguous canonical source repo belong here — attribution errors
   * would fabricate usage records.
   */
  githubMap: Readonly<Record<string, string>>
  /**
   * P2: path to a curated.json data file. When provided, github-provider
   * entries augment `githubMap`; the loaded file is returned in the result.
   * A missing or malformed file fails loud.
   */
  curationPath?: string
}

export type CatalogQuery = { search: string; limit: number } | { filter: string; limit: number }

export const DEFAULT_FAMOUS = [
  'stanfordnlp/imdb',
  'rajpurkar/squad',
  'ylecun/mnist',
  'mozilla-foundation/common_voice_17_0',
  'oscar-corpus/OSCAR-2301',
  'HuggingFaceFW/fineweb',
  'allenai/c4',
  'facebook/voxpopuli',
] as const

export const DEFAULT_QUERIES: readonly CatalogQuery[] = [
  { filter: 'task_ids:sentiment-classification', limit: 8 },
]

/** Repos that ARE the canonical release home of the dataset (auditable, per entry). */
export const DEFAULT_GITHUB_MAP: Readonly<Record<string, string>> = {
  'facebook/voxpopuli': 'facebookresearch/voxpopuli',
  'mozilla-foundation/common_voice_17_0': 'mozilla/common-voice',
  'cardiffnlp/tweet_eval': 'cardiffnlp/tweeteval',
  'mteb/sts14-sts': 'embeddings-benchmark/mteb',
  'openai/gsm8k': 'openai/grade-school-math',
  'nyu-mll/glue': 'nyu-mll/GLUE-baselines',
}

/** One filtered-out candidate, with the rule and word that triggered it. */
export interface BlockedCandidate {
  asset_id: string
  /** 'block' (hit a blocklist token) or 'allow' (failed the allowlist). */
  rule: 'block' | 'allow'
  word: string
}

export interface PipelineResult {
  snapshot: Snapshot
  /** Raw adapter records for auditing (same order as snapshot.assets). */
  raw: HfAssetRecord[]
  /** Per-asset log lines, one per merged source. */
  log: string[]
  /** P0 audit: every blocked candidate with its rule and triggering word. */
  blocked: BlockedCandidate[]
  /** P2 audit: the loaded curation file entries (empty when no file). */
  curation: CuratedEntry[]
}

/** Pure filter: exact-token rules over the candidate id. Exportable for tests. */
export function filterCandidate(
  assetId: string,
  block: readonly string[] | undefined,
  allow: readonly string[] | undefined,
): { pass: true } | { pass: false; rule: 'block' | 'allow'; word: string } {
  const tokens = assetId.toLowerCase().split(/[-_/.]+/)
  if (block !== undefined) {
    for (const token of tokens) {
      if (block.includes(token)) return { pass: false, rule: 'block', word: token }
    }
  }
  if (allow !== undefined && allow.length > 0) {
    for (const token of tokens) {
      if (allow.includes(token)) return { pass: true }
    }
    return { pass: false, rule: 'allow', word: assetId }
  }
  return { pass: true }
}

export async function refreshSnapshot(env: FetchEnv, options: PipelineOptions): Promise<PipelineResult> {
  // P2: load the curation file when configured (loud on missing/malformed).
  let curation: CuratedEntry[] = []
  let githubMap: Readonly<Record<string, string>> = options.githubMap
  if (options.curationPath !== undefined) {
    const file = await loadCurationFile(options.curationPath)
    curation = file.entries
    const merged: Record<string, string> = { ...options.githubMap }
    for (const entry of file.entries) {
      if (entry.provider !== 'github') continue
      const repo = githubRepoFromUrl(entry.url)
      if (repo !== null) merged[entry.asset_id] = repo
    }
    githubMap = merged
  }

  const topIds = await fetchHfTop(env, Math.max(options.topCount, options.limit))
  const candidates: string[] = []
  const blocked: BlockedCandidate[] = []
  const log: string[] = []
  const seen = new Set<string>()
  const addCandidate = (id: string): void => {
    if (seen.has(id)) return
    seen.add(id)
    candidates.push(id)
  }
  const addDiscovered = (id: string): void => {
    const verdict = filterCandidate(id, options.block, options.allow)
    if (verdict.pass) {
      addCandidate(id)
      return
    }
    blocked.push({ asset_id: id, rule: verdict.rule, word: verdict.word })
    log.push(`BLOCK ${id} :: rule=${verdict.rule} word=${JSON.stringify(verdict.word)}`)
  }
  const addQueries = async (): Promise<void> => {
    for (const query of options.queries) {
      let ids: string[]
      try {
        ids = await fetchHfSearch(env, query)
      } catch {
        continue // a failed catalog query shrinks candidates, never the record's honesty
      }
      for (const id of ids) addDiscovered(id)
    }
  }
  if (options.queriesFirst === true) {
    await addQueries()
    for (const id of options.famous) addCandidate(id)
  } else {
    for (const id of options.famous) addCandidate(id)
    await addQueries()
  }
  for (const id of topIds) addDiscovered(id)

  const assets: Asset[] = []
  const raw: HfAssetRecord[] = []

  for (const candidate of candidates) {
    const record = await fetchHfAsset(env, candidate)
    if (record === null) continue

    const sources: SourceMetrics[] = [...record.sources]
    const merged: string[] = ['huggingface']

    const mirror = await fetchModelscopeMirror(env, record.asset_id, record.name)
    if (mirror !== null) {
      sources.push(mirror)
      merged.push('modelscope')
    }

    const doi = findDoi(record.cardCitation)
    if (doi !== null) {
      const citations = await fetchDataciteCitations(env, doi)
      if (citations !== null) {
        sources.push(citations)
        merged.push('datacite')
      }
    }

    const repo = githubMap[record.asset_id]
    if (repo !== undefined) {
      const github = await fetchGithub(env, repo)
      if (github !== null) {
        sources.push(github)
        merged.push('github')
      }
    }

    const fetchedAt = sources[0]?.fetched_at ?? new Date().toISOString()
    assets.push({
      asset_id: record.asset_id,
      id_type: 'hf',
      name: record.name,
      domain: record.domain,
      tags: record.tags,
      description: record.description,
      access: record.access,
      license: record.license,
      verification: record.verification,
      sources,
      timeline: [{
        date: fetchedAt.slice(0, 7),
        metric: 'downloads',
        value: record.downloads,
        source: 'huggingface',
        signal_type: 'deep',
      }],
      citations: [] as Citation[],
    })
    raw.push(record)
    log.push(`${record.asset_id} :: sources=${merged.join('+')}`)
    if (assets.length >= options.limit) break
  }

  if (curation.length > 0) log.push(`curation: ${curation.length} entries loaded`)
  return {
    snapshot: { version: '2', generated_at: new Date().toISOString(), assets },
    raw,
    log,
    blocked,
    curation,
  }
}
