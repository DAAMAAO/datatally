import type { SourceMetrics } from '../types.js'
import { deep, getJson, nowIso, shallow } from './util.js'
import type { FetchEnv } from './util.js'

/**
 * ModelScope mirror probe: HF datasets are commonly mirrored under a
 * ModelScope organization. Probe each known mirror owner by the dataset's
 * short name; the first open hit wins. A missing asset (404) or any
 * network failure returns null — provenance is never fabricated.
 */
const MIRROR_OWNERS = ['AI-ModelScope', 'modelscope', 'damo']

export async function fetchModelscopeMirror(env: FetchEnv, shortName: string): Promise<SourceMetrics | null> {
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
    if (record.gated === true || record.login_required === true || record.private === true) continue
    if (typeof record.downloads !== 'number') continue
    const metrics: Record<string, { value: number; signal_type: 'deep' | 'shallow' }> = {
      downloads: deep(record.downloads),
    }
    if (typeof record.likes === 'number') metrics.likes = shallow(record.likes)
    return {
      source: 'modelscope',
      metrics,
      fetched_at: nowIso(),
    }
  }
  return null
}
