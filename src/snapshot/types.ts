import type { AssetId } from './brand.js'

/**
 * Behavior vs interest — NOT a strength scale.
 * Strength is derived from access, license, and verification facts, by the judge.
 */
export type SignalType = 'deep' | 'shallow'

export type Access = 'open' | 'licensed' // V0.1: always 'open'
export type Verification = 'public_api' | 'authorized_record' // V0.1: always 'public_api'

export interface MetricValue {
  value: number
  signal_type: SignalType
}

export interface SourceMetrics {
  source: string
  metrics: Record<string, MetricValue>
  fetched_at: string
}

export interface TimelineEntry {
  date: string
  metric: string
  value: number
  source: string
  signal_type: SignalType
}

export interface Citation {
  title: string
  year: string
  venue: string
}

export interface Asset {
  asset_id: string
  id_type: 'hf' | 'doi' | 'repo'
  name: string
  domain: string
  /** Real platform tags; optional (absent = none recorded). */
  tags?: string[]
  /** Real platform description, truncated by the fetcher; optional. */
  description?: string
  access: Access
  /** Platform license metadata; `null` when unknown — never a fabricated default. */
  license: string | null
  verification: Verification
  sources: SourceMetrics[]
  timeline: TimelineEntry[]
  citations: Citation[]
}

export interface Snapshot {
  /** "2" — v1 snapshots are rejected with a migration pointer. */
  version: string
  generated_at: string
  assets: Asset[]
}

// ---- canonical tool output shapes (aligned with the declared output schemas) ----

export interface DeepSignalsSummary {
  downloads: number
  citations: number
  forks: number
}

export interface ShallowSignalsSummary {
  stars: number
  likes: number
}

export interface AssetSearchSummary {
  asset_id: string
  name: string
  domain: string
  access: string
  deep_signals: DeepSignalsSummary
  shallow_signals: ShallowSignalsSummary
  fetched_at: string
  snapshot_version: string
}

export interface SignalEntry {
  source: string
  metric: string
  value: number
  fetched_at: string
}

export interface AssetProfile {
  asset_id: string
  name: string
  access: string
  license: string | null
  verification: string
  deep_signals: SignalEntry[]
  shallow_signals: SignalEntry[]
  timeline: TimelineEntry[]
  /** Omitted when citation fields are disabled by config. */
  citations?: Citation[]
  profile_summary: string
  snapshot_version: string
}

export interface CompareDimension {
  dimension: string
  /** 'deep' | 'shallow' — declared from the snapshot's own signal_type. */
  signal_layer: string
  a_value: number
  b_value: number
  same_source: boolean
  same_access: boolean
}

export interface AssetComparison {
  a: { asset_id: string; name: string; access: string }
  b: { asset_id: string; name: string; access: string }
  comparison: CompareDimension[]
  note: string
}

export type { AssetId }
