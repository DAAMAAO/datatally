import type { Asset, Snapshot } from '../snapshot/types.js'

/**
 * P4 — Catalog summary (minimal). Presents distributions only: per-sector
 * asset counts, multi-source rates, and model-uses density. No
 * interpretation layer — the summary states what the record shows and stops.
 */

export interface ModelUsesCounts {
  /** Assets that carry any model-use record (exact or lower bound). */
  assets_with_model_use: number
  /** Sum of exact model_uses values (0 when none recorded exactly). */
  exact_total: number
  /** Sum of model_uses_min lower bounds (0 when none hit the scan cap). */
  min_total: number
}

export interface SectorSummary extends ModelUsesCounts {
  sector: string
  assets: number
  multi_source: number
  multi_source_rate: number
}

export interface CatalogSummary {
  version: string
  generated_at: string
  total_assets: number
  total_multi_source: number
  total_multi_source_rate: number
  sectors: SectorSummary[]
}

export function modelUsesOf(asset: Asset): { exact: number; min: number } {
  let exact = 0
  let min = 0
  for (const source of asset.sources) {
    const entry = source.metrics.model_uses
    if (entry !== undefined) exact += entry.value
    const bound = source.metrics.model_uses_min
    if (bound !== undefined) min += bound.value
  }
  return { exact, min }
}

export function catalogSummary(snapshot: Snapshot): CatalogSummary {
  const bySector = new Map<string, Asset[]>()
  for (const asset of snapshot.assets) {
    const sector = asset.sector ?? 'core'
    const list = bySector.get(sector)
    if (list === undefined) bySector.set(sector, [asset])
    else list.push(asset)
  }
  const sectors: SectorSummary[] = [...bySector.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([sector, assets]) => {
      const multi = assets.filter((asset) => asset.sources.length >= 2).length
      const used = assets.filter((asset) => {
        const counts = modelUsesOf(asset)
        return counts.exact > 0 || counts.min > 0
      })
      const exactTotal = assets.reduce((sum, asset) => sum + modelUsesOf(asset).exact, 0)
      const minTotal = assets.reduce((sum, asset) => sum + modelUsesOf(asset).min, 0)
      return {
        sector,
        assets: assets.length,
        multi_source: multi,
        multi_source_rate: assets.length === 0 ? 0 : multi / assets.length,
        assets_with_model_use: used.length,
        exact_total: exactTotal,
        min_total: minTotal,
      }
    })
  const totalMulti = sectors.reduce((sum, sector) => sum + sector.multi_source, 0)
  return {
    version: snapshot.version,
    generated_at: snapshot.generated_at,
    total_assets: snapshot.assets.length,
    total_multi_source: totalMulti,
    total_multi_source_rate: snapshot.assets.length === 0 ? 0 : totalMulti / snapshot.assets.length,
    sectors,
  }
}

export function renderCatalogText(summary: CatalogSummary): string {
  const lines: string[] = [
    `catalog: ${summary.total_assets} assets | ${summary.total_multi_source} multi-source (${(summary.total_multi_source_rate * 100).toFixed(1)}%) | snapshot v${summary.version} @ ${summary.generated_at}`,
    'per sector (distributions only):',
  ]
  for (const sector of summary.sectors) {
    lines.push(
      `- ${sector.sector}: ${sector.assets} assets | multi-source ${sector.multi_source} (${(sector.multi_source_rate * 100).toFixed(1)}%)`
      + ` | model-use records on ${sector.assets_with_model_use} assets | exact uses ${sector.exact_total}${sector.min_total > 0 ? ` + >=${sector.min_total} capped` : ''}`,
    )
  }
  return lines.join('\n')
}
