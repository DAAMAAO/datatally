import type {
  Access,
  Asset,
  Citation,
  MetricValue,
  SignalType,
  Snapshot,
  SourceMetrics,
  TimelineEntry,
  Verification,
} from '../snapshot/types.js'

/**
 * Strict structural validator for the self-owned snapshot.
 * Unknown fields are rejected — including the legacy `asset_class` field
 * (regression guard). Missing provenance is never fabricated: fields absent
 * in the file are absent in the validated result.
 */
export const SNAPSHOT_VERSION = '2'

export class SnapshotValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SnapshotValidationError'
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SnapshotValidationError(message)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const SNAPSHOT_KEYS = new Set(['version', 'generated_at', 'assets'])
const ASSET_KEYS = new Set([
  'asset_id', 'id_type', 'name', 'domain', 'tags', 'description',
  'access', 'license', 'verification', 'sources', 'timeline', 'citations',
])
const SOURCE_KEYS = new Set(['source', 'metrics', 'fetched_at'])
const TIMELINE_KEYS = new Set(['date', 'metric', 'value', 'source', 'signal_type'])
const CITATION_KEYS = new Set(['title', 'year', 'venue'])
const ID_TYPES: ReadonlySet<Asset['id_type']> = new Set(['hf', 'doi', 'repo'])
const ACCESS_VALUES: ReadonlySet<Access> = new Set(['open', 'licensed'])
const VERIFICATION_VALUES: ReadonlySet<Verification> = new Set(['public_api', 'authorized_record'])
const SIGNAL_TYPES: ReadonlySet<SignalType> = new Set(['deep', 'shallow'])

function checkKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>, what: string): void {
  for (const key of Object.keys(record)) {
    assert(allowed.has(key), `${what} carries unknown field ${JSON.stringify(key)} (legacy fields such as "asset_class" are rejected)`)
  }
}

function requireString(record: Record<string, unknown>, key: string, what: string): string {
  const value = record[key]
  assert(typeof value === 'string' && value.length > 0, `${what}.${key} must be a non-empty string`)
  return value
}

function requireNumber(record: Record<string, unknown>, key: string, what: string): number {
  const value = record[key]
  assert(typeof value === 'number' && Number.isFinite(value), `${what}.${key} must be a finite number`)
  return value
}

function requireOneOf<T extends string>(record: Record<string, unknown>, key: string, allowed: ReadonlySet<T>, what: string): T {
  const value = record[key]
  assert(typeof value === 'string' && allowed.has(value as T), `${what}.${key} must be one of ${[...allowed].join(', ')}`)
  return value as T
}

function validateMetricValue(value: unknown, what: string): MetricValue {
  assert(isRecord(value), `${what} must be an object`)
  checkKeys(value, new Set(['value', 'signal_type']), what)
  return {
    value: requireNumber(value, 'value', what),
    signal_type: requireOneOf<SignalType>(value, 'signal_type', SIGNAL_TYPES, what),
  }
}

function validateSource(value: unknown, index: number, assetWhat: string): SourceMetrics {
  const what = `${assetWhat}.sources[${index}]`
  assert(isRecord(value), `${what} must be an object`)
  checkKeys(value, SOURCE_KEYS, what)
  const source = requireString(value, 'source', what)
  const rawMetrics = value.metrics
  assert(isRecord(rawMetrics) && Object.keys(rawMetrics).length > 0, `${what}.metrics must be a non-empty object`)
  const metrics: Record<string, MetricValue> = {}
  for (const [metric, metricValue] of Object.entries(rawMetrics)) {
    assert(metric.length > 0, `${what}.metrics carries an empty metric name`)
    metrics[metric] = validateMetricValue(metricValue, `${what}.metrics.${metric}`)
  }
  return { source, metrics, fetched_at: requireString(value, 'fetched_at', what) }
}

function validateTimelineEntry(value: unknown, index: number, assetWhat: string): TimelineEntry {
  const what = `${assetWhat}.timeline[${index}]`
  assert(isRecord(value), `${what} must be an object`)
  checkKeys(value, TIMELINE_KEYS, what)
  return {
    date: requireString(value, 'date', what),
    metric: requireString(value, 'metric', what),
    value: requireNumber(value, 'value', what),
    source: requireString(value, 'source', what),
    signal_type: requireOneOf<SignalType>(value, 'signal_type', SIGNAL_TYPES, what),
  }
}

function validateCitation(value: unknown, index: number, assetWhat: string): Citation {
  const what = `${assetWhat}.citations[${index}]`
  assert(isRecord(value), `${what} must be an object`)
  checkKeys(value, CITATION_KEYS, what)
  return {
    title: requireString(value, 'title', what),
    year: requireString(value, 'year', what),
    venue: requireString(value, 'venue', what),
  }
}

function validateAsset(value: unknown, index: number): Asset {
  const what = `assets[${index}]`
  assert(isRecord(value), `${what} must be an object`)
  checkKeys(value, ASSET_KEYS, what)
  const assetId = requireString(value, 'asset_id', what)
  const license = value.license
  assert(license === null || typeof license === 'string', `${what}.license must be a string or null (missing license is null, never a fabricated default)`)
  const tags = value.tags
  if (tags !== undefined) {
    assert(Array.isArray(tags) && tags.every((tag) => typeof tag === 'string'), `${what}.tags must be an array of strings`)
  }
  const description = value.description
  if (description !== undefined) {
    assert(typeof description === 'string', `${what}.description must be a string`)
  }
  const sourcesRaw = value.sources
  assert(Array.isArray(sourcesRaw), `${what}.sources must be an array`)
  const timelineRaw = value.timeline
  assert(Array.isArray(timelineRaw), `${what}.timeline must be an array`)
  const citationsRaw = value.citations
  assert(Array.isArray(citationsRaw), `${what}.citations must be an array`)
  return {
    asset_id: assetId,
    id_type: requireOneOf(value, 'id_type', ID_TYPES, what),
    name: requireString(value, 'name', what),
    domain: requireString(value, 'domain', what),
    ...(tags === undefined ? {} : { tags: tags as string[] }),
    ...(description === undefined ? {} : { description: description as string }),
    access: requireOneOf(value, 'access', ACCESS_VALUES, what),
    license: license as string | null,
    verification: requireOneOf(value, 'verification', VERIFICATION_VALUES, what),
    sources: sourcesRaw.map((source, i) => validateSource(source, i, what)),
    timeline: timelineRaw.map((entry, i) => validateTimelineEntry(entry, i, what)),
    citations: citationsRaw.map((citation, i) => validateCitation(citation, i, what)),
  }
}

/** Validate an untrusted value into a typed {@link Snapshot}. Throws {@link SnapshotValidationError}. */
export function validateSnapshot(value: unknown): Snapshot {
  assert(isRecord(value), 'snapshot root must be an object')
  checkKeys(value, SNAPSHOT_KEYS, 'snapshot')
  const assets = value.assets
  assert(Array.isArray(assets), 'snapshot.assets must be an array')
  return {
    version: requireString(value, 'version', 'snapshot'),
    generated_at: requireString(value, 'generated_at', 'snapshot'),
    assets: assets.map((asset, i) => validateAsset(asset, i)),
  }
}
