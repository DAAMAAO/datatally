import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFactExport } from '../src/core/export.js'
import { requireAsset } from '../src/core/query.js'
import { fixtureSnapshot } from './helpers/fixture.js'

describe('P1 fact profile export (AI-BOM entry)', () => {
  it('contains pure facts only — no interpretation keys', () => {
    const asset = requireAsset(fixtureSnapshot, 'stanfordnlp/imdb')
    const entry = buildFactExport(fixtureSnapshot, asset)
    const keys = Object.keys(entry).sort()
    assert.deepEqual(keys, [
      'access', 'asset_id', 'citations', 'completeness', 'domain', 'generated_at',
      'id_type', 'license', 'name', 'schema', 'sector', 'snapshot_version', 'sources', 'timeline', 'verification',
    ])
    assert.equal(entry.schema, 'datatally.fact-export.v1')
    // banned vocabulary: nothing that looks like a conclusion or a rating
    assert.ok(!JSON.stringify(entry).match(/risk|score|rating|suitab|quality|recommend/i))
  })

  it('marks single-source assets with the factual marker and null span', () => {
    const squad = requireAsset(fixtureSnapshot, 'rajpurkar/squad')
    const entry = buildFactExport(fixtureSnapshot, squad)
    assert.equal(entry.completeness.source_count, 1)
    assert.equal(entry.completeness.single_source, 'single source only — multi-source aggregation not met')
    assert.equal(entry.completeness.fetched_at_span_ms, null)
  })

  it('reports multi-source completeness with per-source calibers and fetch span', () => {
    const speech = requireAsset(fixtureSnapshot, 'org/speech-data')
    const entry = buildFactExport(fixtureSnapshot, speech)
    assert.equal(entry.completeness.single_source, 'multi-source aggregation met')
    assert.equal(entry.completeness.per_source.length, 2)
    const hf = entry.completeness.per_source.find((source) => source.source === 'huggingface')
    assert.deepEqual(hf?.deep_metrics, ['downloads', 'model_uses'])
    assert.deepEqual(hf?.shallow_metrics, ['likes'])
    const dc = entry.completeness.per_source.find((source) => source.source === 'datacite')
    assert.deepEqual(dc?.deep_metrics, ['citations'])
    assert.equal(entry.completeness.fetched_at_span_ms, 86400000) // 2026-09-05 → 2026-09-06
  })

  it('passes a missing license through as null and carries generated_at', () => {
    const imdb = requireAsset(fixtureSnapshot, 'stanfordnlp/imdb')
    const entry = buildFactExport(fixtureSnapshot, imdb)
    assert.equal(entry.license, null)
    assert.equal(entry.generated_at, fixtureSnapshot.generated_at)
    assert.equal(entry.sector, 'film-industry')
    assert.equal(entry.snapshot_version, '2')
  })
})
