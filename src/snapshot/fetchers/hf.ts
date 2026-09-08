import type { SourceMetrics } from '../types.js'
import { deep, getJson, inferDomain, nowIso, shallow, shortName } from './util.js'
import type { FetchEnv } from './util.js'

export interface HfAssetRecord {
  asset_id: string
  name: string
  domain: string
  tags: string[]
  description: string
  access: 'open'
  license: string | null
  verification: 'public_api'
  /** Raw cardData.citation text, for DOI extraction downstream. */
  cardCitation: string | null
  /** Total downloads from the huggingface source (used for the timeline entry). */
  downloads: number
  sources: SourceMetrics[]
}

const MAX_MODEL_USES_SCAN = 500

/** Top datasets by downloads, open (non-gated) only. */
export async function fetchHfTop(env: FetchEnv, limit: number): Promise<string[]> {
  return fetchHfList(env, { sort: 'downloads', direction: '-1', limit: Math.max(1, limit) })
}

/**
 * Search datasets by keyword or tag filter (e.g. `task_ids:sentiment-classification`),
 * sorted by downloads, open (non-gated) only.
 */
export async function fetchHfSearch(
  env: FetchEnv,
  query: { search: string; limit: number } | { filter: string; limit: number },
): Promise<string[]> {
  const params = {
    sort: 'downloads',
    direction: '-1',
    limit: Math.max(1, query.limit),
  }
  return fetchHfList(env, 'search' in query ? { ...params, search: query.search } : { ...params, filter: query.filter })
}

async function fetchHfList(env: FetchEnv, params: Record<string, string | number>): Promise<string[]> {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) search.set(key, String(value))
  const data = await getJson(env, `${env.hfBase}/api/datasets?${search.toString()}`)
  if (!Array.isArray(data)) throw new Error(`hf list endpoint returned ${typeof data}, expected an array`)
  const ids: string[] = []
  for (const entry of data) {
    if (entry === null || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    if (record.gated === true || record.disabled === true || record.private === true) continue
    if (typeof record.id === 'string') ids.push(record.id)
  }
  return ids
}

/**
 * Count models that list this dataset. The count is exact below the scan cap;
 * a count AT the cap is recorded as `model_uses_min` (an honest lower bound,
 * never a rounded exact number).
 */
async function fetchModelUses(env: FetchEnv, assetId: string): Promise<{ exact: number } | { min: number } | null> {
  try {
    const data = await getJson(env, `${env.hfBase}/api/models?filter=dataset:${encodeURIComponent(assetId)}&limit=${MAX_MODEL_USES_SCAN}`)
    if (!Array.isArray(data)) return null
    if (data.length >= MAX_MODEL_USES_SCAN) return { min: data.length }
    return { exact: data.length }
  } catch {
    return null
  }
}

/** Full asset record from the dataset detail endpoint; null for gated/disabled/absent assets. */
export async function fetchHfAsset(env: FetchEnv, assetId: string): Promise<HfAssetRecord | null> {
  let data: unknown
  try {
    data = await getJson(env, `${env.hfBase}/api/datasets/${assetId}`)
  } catch {
    return null
  }
  if (data === null || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  if (record.gated === true || record.disabled === true || record.private === true) return null
  const rawLicense = (record.cardData as Record<string, unknown> | undefined)?.license
  let license: string | null = null
  if (typeof rawLicense === 'string' && rawLicense.length > 0) license = rawLicense
  else if (Array.isArray(rawLicense)) {
    const items = rawLicense.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    if (items.length > 0) license = items.join(', ')
  }
  const downloads = typeof record.downloads === 'number' ? record.downloads : 0
  const likes = typeof record.likes === 'number' ? record.likes : 0
  const modelUses = await fetchModelUses(env, assetId)
  const metrics: Record<string, { value: number; signal_type: 'deep' | 'shallow' }> = {
    downloads: deep(downloads),
    likes: shallow(likes),
  }
  if (modelUses !== null) {
    if ('exact' in modelUses) metrics.model_uses = deep(modelUses.exact)
    else metrics.model_uses_min = deep(modelUses.min)
  }
  const cardData = record.cardData as Record<string, unknown> | undefined
  const citation = cardData !== undefined && typeof cardData.citation === 'string' ? cardData.citation : null
  return {
    asset_id: assetId,
    name: shortName(assetId),
    domain: inferDomain(record.tags),
    tags: (Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === 'string') : []).slice(0, 16),
    description: typeof record.description === 'string'
      ? record.description.replace(/\s+/g, ' ').trim().slice(0, 600)
      : '',
    access: 'open',
    license,
    verification: 'public_api',
    cardCitation: citation,
    downloads,
    sources: [{
      source: 'huggingface',
      metrics,
      fetched_at: nowIso(),
    }],
  }
}
