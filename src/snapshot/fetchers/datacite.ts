import type { SourceMetrics } from '../types.js'
import { deep, getJson, nowIso } from './util.js'
import type { FetchEnv } from './util.js'

/** Extract the first DOI from a dataset card citation (bibtex text). */
export function findDoi(citation: string | null): string | null {
  if (citation === null || citation.length === 0) return null
  const match = citation.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/)
  return match ? match[0].replace(/[",'}]$/, '') : null
}

/**
 * DataCite citation count for one DOI. The count reflects DataCite-registered
 * citations (e.g. Crossref events) — its scope is declared by the source name,
 * never generalized. Any failure returns null (no fabricated zero).
 */
export async function fetchDataciteCitations(env: FetchEnv, doi: string): Promise<SourceMetrics | null> {
  let data: unknown
  try {
    data = await getJson(env, `https://api.datacite.org/dois/${encodeURIComponent(doi)}`)
  } catch {
    return null
  }
  if (data === null || typeof data !== 'object') return null
  const attributes = (data as { data?: { attributes?: unknown } }).data?.attributes
  if (attributes === null || typeof attributes !== 'object') return null
  const count = (attributes as Record<string, unknown>).citationCount
  if (typeof count !== 'number') return null
  return {
    source: 'datacite',
    metrics: { citations: deep(count) },
    fetched_at: nowIso(),
  }
}
