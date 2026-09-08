import type {
  Asset,
  AssetComparison,
  AssetProfile,
  AssetSearchSummary,
  CompareDimension,
  SignalEntry,
  SignalType,
  Snapshot,
} from '../snapshot/types.js'

/**
 * Pure query layer: ecosystem-agnostic functions over the validated snapshot.
 * The core records and projects facts — it never scores, weighs, or ranks.
 */

/** Sum one metric across every source that recorded it. */
export function metricTotal(asset: Asset, metricName: string): number {
  let total = 0
  for (const source of asset.sources) {
    const metric = source.metrics[metricName]
    if (metric !== undefined && typeof metric.value === 'number') total += metric.value
  }
  return total
}

export function sourceCount(asset: Asset): number {
  return asset.sources.length
}

export function latestFetchedAt(asset: Asset): string {
  let latest = ''
  for (const source of asset.sources) {
    if (source.fetched_at > latest) latest = source.fetched_at
  }
  return latest
}

/**
 * Per-source metric entries of one signal layer. The layer comes from the
 * snapshot's own `signal_type` declarations — the core hardcodes no strength scale.
 */
export function layerEntries(asset: Asset, layer: SignalType): SignalEntry[] {
  const entries: SignalEntry[] = []
  for (const source of asset.sources) {
    for (const [metric, entry] of Object.entries(source.metrics)) {
      if (entry.signal_type === layer) {
        entries.push({ source: source.source, metric, value: entry.value, fetched_at: source.fetched_at })
      }
    }
  }
  return entries
}

/** Normalize for literal substring matching: lowercase, separators become spaces. */
export function normText(value: string | undefined): string {
  return String(value ?? '').toLowerCase().replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Literal, predictable matching against name, id, domain, tags, and
 * description. No relevance scoring — matching is a record operation,
 * never an interpretation.
 */
export function matchesQuery(asset: Asset, query: string, domain?: string): boolean {
  const q = normText(query)
  const tagsText = Array.isArray(asset.tags) ? asset.tags.join(' ') : ''
  const hay = [asset.name, asset.asset_id, asset.domain, tagsText, asset.description]
    .map((part) => normText(part))
    .join(' ')
  const queryOk = q === '' || hay.includes(q)
  const domainOk = domain === undefined || domain === '' || asset.domain === domain
  return queryOk && domainOk
}

/**
 * Filter by query and domain, truncate to `limit` (default and cap from
 * config). Results keep snapshot order — no usage-based sorting, which
 * would read as ranking.
 */
export function searchAssets(
  snapshot: Snapshot,
  query: string,
  domain: string | undefined,
  limit: number | undefined,
  maxResults: number,
): AssetSearchSummary[] {
  const cap = Math.max(1, Math.floor(maxResults))
  const count = Math.max(1, Math.min(limit ?? cap, cap))
  const hits: AssetSearchSummary[] = []
  for (const asset of snapshot.assets) {
    if (!matchesQuery(asset, query, domain)) continue
    if (hits.length >= count) break
    hits.push({
      asset_id: asset.asset_id,
      name: asset.name,
      domain: asset.domain,
      access: asset.access,
      deep_signals: {
        downloads: metricTotal(asset, 'downloads'),
        citations: metricTotal(asset, 'citations'),
        forks: metricTotal(asset, 'forks'),
      },
      shallow_signals: {
        stars: metricTotal(asset, 'stars'),
        likes: metricTotal(asset, 'likes'),
      },
      fetched_at: latestFetchedAt(asset),
      snapshot_version: snapshot.version,
    })
  }
  return hits
}

/** Lookup by exact id. A missing asset is an error, not an empty result. */
export function requireAsset(snapshot: Snapshot, assetId: string): Asset {
  const asset = snapshot.assets.find((candidate) => candidate.asset_id === assetId)
  if (asset === undefined) {
    throw new Error(`asset not found: ${JSON.stringify(assetId)} — a missing asset is an error, not an empty result`)
  }
  return asset
}

/** Neutral description of the record — facts only, never a judgment. */
export function profileSummaryText(asset: Asset, snapshot: Snapshot): string {
  const sources = sourceCount(asset)
  const licenseText = typeof asset.license === 'string' && asset.license.length > 0
    ? asset.license
    : 'no license recorded'
  const fetched = latestFetchedAt(asset)
  const parts = [
    `Usage profile for ${asset.name} (${asset.domain}), ${asset.access} access under ${licenseText}, verified via ${asset.verification}.`,
    `Recorded from ${sources} source${sources === 1 ? '' : 's'}${fetched ? ` at ${fetched}` : ''} (snapshot version ${snapshot.version}).`,
    `Snapshot generated ${snapshot.generated_at}.`,
  ]
  if (sources < 2) parts.push('single source only — multi-source aggregation not met')
  return parts.join(' ')
}

/** Full profile projection; every output field derives from the record. */
export function buildProfile(
  snapshot: Snapshot,
  asset: Asset,
  options: { includeCitations: boolean },
): AssetProfile {
  const profile: AssetProfile = {
    asset_id: asset.asset_id,
    name: asset.name,
    access: asset.access,
    license: asset.license,
    verification: asset.verification,
    deep_signals: layerEntries(asset, 'deep'),
    shallow_signals: layerEntries(asset, 'shallow'),
    timeline: asset.timeline.map(({ date, metric, value, source, signal_type }) => ({
      date, metric, value, source, signal_type,
    })),
    profile_summary: profileSummaryText(asset, snapshot),
    generated_at: snapshot.generated_at,
    snapshot_version: snapshot.version,
  }
  if (options.includeCitations) {
    profile.citations = asset.citations.map(({ title, year, venue }) => ({ title, year, venue }))
  }
  return profile
}

/**
 * Per-dimension comparison, always inside one signal layer and one evidence
 * category. A star is never compared against a download: dimensions are
 * per-metric, and the layer is read from the snapshot's own declarations.
 */
export function compareAssets(a: Asset, b: Asset): AssetComparison {
  const dimensions: CompareDimension[] = []
  const metricNames = ['downloads', 'citations', 'forks', 'stars', 'likes'] as const
  for (const metric of metricNames) {
    let layer: SignalType | null = null
    for (const asset of [a, b]) {
      for (const source of asset.sources) {
        const entry = source.metrics[metric]
        if (entry !== undefined) {
          layer = entry.signal_type
          break
        }
      }
      if (layer !== null) break
    }
    if (layer === null) continue
    const aSources = a.sources.filter((source) => source.metrics[metric] !== undefined).map((source) => source.source)
    const bSources = b.sources.filter((source) => source.metrics[metric] !== undefined).map((source) => source.source)
    const sameSource = aSources.length > 0 && bSources.length > 0
      && aSources.length === bSources.length
      && aSources.every((source) => bSources.includes(source))
    dimensions.push({
      dimension: metric,
      signal_layer: layer,
      a_value: metricTotal(a, metric),
      b_value: metricTotal(b, metric),
      same_source: sameSource,
      same_access: a.access === b.access,
    })
  }
  const crossSource = dimensions.some((dimension) => !dimension.same_source)
  return {
    a: { asset_id: a.asset_id, name: a.name, access: a.access },
    b: { asset_id: b.asset_id, name: b.name, access: b.access },
    comparison: dimensions,
    note: crossSource ? 'cross-source metrics are not directly comparable' : '',
  }
}
