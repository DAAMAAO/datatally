import type {
  AssetComparison,
  AssetProfile,
  AssetSearchSummary,
  SignalEntry,
} from '../snapshot/types.js'

/**
 * Model-visible text projections of the canonical values.
 * Rule: everything rendered is reconstructable from the canonical value —
 * render adds formatting, never new facts.
 */

const fmtNum = (value: number | undefined): string =>
  typeof value === 'number' ? String(value) : 'n/a'

export function renderSearchText(value: AssetSearchSummary[]): string {
  if (value.length === 0) return 'no assets matched the query'
  const lines: string[] = []
  for (const hit of value) {
    lines.push(
      `- ${hit.name} (${hit.asset_id}) | domain: ${hit.domain} | access: ${hit.access}`
      + ` | deep: downloads ${fmtNum(hit.deep_signals.downloads)}, citations ${fmtNum(hit.deep_signals.citations)}, forks ${fmtNum(hit.deep_signals.forks)}`
      + ` | shallow: likes ${fmtNum(hit.shallow_signals.likes)}, stars ${fmtNum(hit.shallow_signals.stars)}`
      + ` | fetched_at: ${hit.fetched_at} | snapshot: v${hit.snapshot_version}`,
    )
  }
  return lines.join('\n')
}

function renderSignals(entries: SignalEntry[]): string {
  if (entries.length === 0) return '  (none recorded)'
  return entries
    .map((entry) => `  - ${entry.metric}: ${fmtNum(entry.value)} (source: ${entry.source}, fetched_at: ${entry.fetched_at})`)
    .join('\n')
}

export function renderProfileText(value: AssetProfile): string {
  const lines: string[] = [
    `${value.name} (${value.asset_id})`,
    `access: ${value.access} | license: ${String(value.license)} | verification: ${value.verification} | snapshot: v${value.snapshot_version}`,
    'deep signals (actual use):',
    renderSignals(value.deep_signals),
    'shallow signals (interest only):',
    renderSignals(value.shallow_signals),
    'timeline:',
  ]
  if (value.timeline.length === 0) {
    lines.push('  (none recorded)')
  } else {
    for (const entry of value.timeline) {
      lines.push(`  - ${entry.date} ${entry.metric}: ${fmtNum(entry.value)} (source: ${entry.source}, ${entry.signal_type})`)
    }
  }
  lines.push('citations:')
  const citations = value.citations ?? []
  if (citations.length === 0) {
    lines.push('  (none recorded)')
  } else {
    for (const citation of citations) {
      lines.push(`  - ${citation.title} (${citation.year}, ${citation.venue})`)
    }
  }
  lines.push(`profile summary: ${value.profile_summary}`)
  return lines.join('\n')
}

export function renderCompareText(value: AssetComparison): string {
  const lines: string[] = [
    `comparing ${value.a.name} (${value.a.asset_id}) vs ${value.b.name} (${value.b.asset_id})`,
  ]
  if (value.comparison.length === 0) {
    lines.push('no shared dimensions recorded')
  } else {
    for (const dimension of value.comparison) {
      lines.push(
        `- ${dimension.dimension} [${dimension.signal_layer}]: ${fmtNum(dimension.a_value)} vs ${fmtNum(dimension.b_value)}`
        + ` | same_source: ${String(dimension.same_source)} | same_access: ${String(dimension.same_access)}`,
      )
    }
  }
  if (value.note.length > 0) lines.push(`note: ${value.note}`)
  return lines.join('\n')
}
