import type { MetricValue, SourceMetrics } from '../types.js'
import { deep, getJson, nowIso, shallow } from './util.js'
import type { FetchEnv } from './util.js'

/**
 * ModelScope mirror discovery. Names are the hub identity, so a mirror is
 * accepted only on an EXACT id match (same org + name) or an exact
 * short-name suffix under another org (top result sorted by downloads) —
 * keyword proximity alone never counts as attribution.
 */
const MIRROR_OWNERS = ['AI-ModelScope', 'modelscope', 'damo']

const normalizeId = (id: unknown): string => String(id ?? '').toLowerCase()

const isOpen = (record: Record<string, unknown>): boolean =>
  record.gated !== true && record.login_required !== true && record.private !== true

function toMetrics(record: Record<string, unknown>): SourceMetrics | null {
  if (typeof record.downloads !== 'number') return null
  const metrics: Record<string, MetricValue> = { downloads: deep(record.downloads) }
  if (typeof record.likes === 'number') metrics.likes = shallow(record.likes)
  return { source: 'modelscope', metrics, fetched_at: nowIso() }
}

export async function fetchModelscopeMirror(env: FetchEnv, assetId: string, shortName: string): Promise<SourceMetrics | null> {
  // 1) Cross-owner search by the canonical short name.
  try {
    const data = await getJson(env, `${env.modelscopeBase}/openapi/v1/datasets?search=${encodeURIComponent(shortName)}&sort=downloads&page_size=10`)
    if (data !== null && typeof data === 'object') {
      const datasets = (data as { data?: { datasets?: unknown } }).data?.datasets
      if (Array.isArray(datasets)) {
        const open = datasets
          .filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === 'object')
          .filter((record) => isOpen(record))
        const wanted = normalizeId(assetId)
        const exact = open.find((record) => normalizeId(record.id) === wanted)
        if (exact !== undefined) {
          const metrics = toMetrics(exact)
          if (metrics !== null) return metrics
        }
        const suffix = open.find((record) => normalizeId(record.id).endsWith('/' + shortName.toLowerCase()))
        if (suffix !== undefined) {
          const metrics = toMetrics(suffix)
          if (metrics !== null) return metrics
        }
      }
    }
  } catch {
    // fall through to the deterministic owner probes
  }

  // 2) Fixed-owner probes as the fallback when search is unavailable.
  for (const owner of MIRROR_OWNERS) {
    let data: unknown
    try {
      data = await getJson(env, `${env.modelscopeBase}/openapi/v1/datasets/${owner}/${shortName}`)
    } catch {
      continue
    }
    if (data === null || typeof data !== 'object') continue
    const detail = (data as { data?: unknown }).data
    if (detail === null || typeof detail !== 'object') continue
    const record = detail as Record<string, unknown>
    if (!isOpen(record)) continue
    const metrics = toMetrics(record)
    if (metrics !== null) return metrics
  }
  return null
}
