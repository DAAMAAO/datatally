import type { Asset, Citation, Snapshot, SourceMetrics } from '../types.js'
import { findDoi, fetchDataciteCitations } from './datacite.js'
import { fetchGithub } from './github.js'
import { fetchHfAsset, fetchHfTop } from './hf.js'
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
  /** Final asset count (the seed ships 10). */
  limit: number
  /** How many top-downloads candidates to consider beyond the famous list. */
  topCount: number
  /** Recognizable candidate ids tried first (skipped when gated/absent). */
  famous: readonly string[]
  /**
   * Curated dataset→repository mapping for GitHub signals. Only entries with
   * an unambiguous canonical source repo belong here — attribution errors
   * would fabricate usage records.
   */
  githubMap: Readonly<Record<string, string>>
}

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

/** Repos that ARE the canonical release home of the dataset (auditable, per entry). */
export const DEFAULT_GITHUB_MAP: Readonly<Record<string, string>> = {
  'facebook/voxpopuli': 'facebookresearch/voxpopuli',
  'mozilla-foundation/common_voice_17_0': 'mozilla/common-voice',
}

export interface PipelineResult {
  snapshot: Snapshot
  /** Raw adapter records for auditing (same order as snapshot.assets). */
  raw: HfAssetRecord[]
  /** Per-asset log lines, one per merged source. */
  log: string[]
}

export async function refreshSnapshot(env: FetchEnv, options: PipelineOptions): Promise<PipelineResult> {
  const topIds = await fetchHfTop(env, Math.max(options.topCount, options.limit))
  const candidates: string[] = []
  const seen = new Set<string>()
  for (const id of [...options.famous, ...topIds]) {
    if (seen.has(id)) continue
    seen.add(id)
    candidates.push(id)
  }

  const assets: Asset[] = []
  const raw: HfAssetRecord[] = []
  const log: string[] = []

  for (const candidate of candidates) {
    const record = await fetchHfAsset(env, candidate)
    if (record === null) continue

    const sources: SourceMetrics[] = [...record.sources]
    const merged: string[] = ['huggingface']

    const mirror = await fetchModelscopeMirror(env, record.name)
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

    const repo = options.githubMap[record.asset_id]
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

  return {
    snapshot: { version: '2', generated_at: new Date().toISOString(), assets },
    raw,
    log,
  }
}
