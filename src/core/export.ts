import type { Asset, Citation, MetricValue, Snapshot, SourceMetrics, TimelineEntry } from '../snapshot/types.js'

/**
 * P1 — Fact Profile Export (AI-BOM dataset entries).
 *
 * Pure facts only: license, sources, usage metrics, snapshot timestamps,
 * generated_at, and a multi-source completeness section. No compliance
 * conclusions, no risk ratings, no training-suitability judgments — the
 * product exports ingredients; customers' lawyers and auditors draw
 * conclusions.
 */
export interface ExportSignal {
  value: number
  signal_type: 'deep' | 'shallow'
}

export interface ExportSource {
  source: string
  metrics: Record<string, ExportSignal>
  fetched_at: string
}

export interface ExportCompletenessSource {
  source: string
  fetched_at: string
  /** The metric names this source contributed, per signal layer (caliber by layer). */
  deep_metrics: string[]
  shallow_metrics: string[]
}

export interface FactExportCompleteness {
  source_count: number
  /** Factual marker; never interpreted: a missing second source is stated, not weighed. */
  single_source: 'single source only — multi-source aggregation not met' | 'multi-source aggregation met'
  per_source: ExportCompletenessSource[]
  /** Milliseconds between the oldest and newest fetched_at; null with < 2 sources. */
  fetched_at_span_ms: number | null
}

export interface FactExport {
  schema: 'datatally.fact-export.v1'
  asset_id: string
  name: string
  domain: string
  sector?: string
  id_type: string
  access: string
  /** Platform license metadata; null when unknown — never a fabricated default. */
  license: string | null
  verification: string
  sources: ExportSource[]
  timeline: TimelineEntry[]
  citations: Citation[]
  generated_at: string
  snapshot_version: string
  completeness: FactExportCompleteness
}

function metricList(asset: Asset, source: SourceMetrics, layer: 'deep' | 'shallow'): string[] {
  const names: string[] = []
  for (const [metric, entry] of Object.entries(source.metrics)) {
    if (entry.signal_type === layer) names.push(metric)
  }
  return names.sort()
}

/** Pure fact projection of one asset; every field derives from the record. */
export function buildFactExport(snapshot: Snapshot, asset: Asset): FactExport {
  const sources: ExportSource[] = asset.sources.map((source) => ({
    source: source.source,
    metrics: Object.fromEntries(
      Object.entries(source.metrics).map(([metric, entry]) => [metric, { value: entry.value, signal_type: entry.signal_type } satisfies ExportSignal]),
    ),
    fetched_at: source.fetched_at,
  }))
  const fetchedTimes = asset.sources.map((source) => source.fetched_at).sort()
  const span = fetchedTimes.length < 2
    ? null
    : Math.max(0, new Date(fetchedTimes[fetchedTimes.length - 1]!).getTime() - new Date(fetchedTimes[0]!).getTime())
  const perSource: ExportCompletenessSource[] = asset.sources.map((source) => ({
    source: source.source,
    fetched_at: source.fetched_at,
    deep_metrics: metricList(asset, source, 'deep'),
    shallow_metrics: metricList(asset, source, 'shallow'),
  }))
  const exportEntry: FactExport = {
    schema: 'datatally.fact-export.v1',
    asset_id: asset.asset_id,
    name: asset.name,
    domain: asset.domain,
    ...(asset.sector === undefined ? {} : { sector: asset.sector }),
    id_type: asset.id_type,
    access: asset.access,
    license: asset.license,
    verification: asset.verification,
    sources,
    timeline: asset.timeline.map(({ date, metric, value, source, signal_type }) => ({ date, metric, value, source, signal_type })),
    citations: asset.citations.map(({ title, year, venue }) => ({ title, year, venue })),
    generated_at: snapshot.generated_at,
    snapshot_version: snapshot.version,
    completeness: {
      source_count: asset.sources.length,
      single_source: asset.sources.length < 2
        ? 'single source only — multi-source aggregation not met'
        : 'multi-source aggregation met',
      per_source: perSource,
      fetched_at_span_ms: Number.isFinite(span) ? span : null,
    },
  }
  return exportEntry
}
