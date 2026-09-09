import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { catalogSummary, modelUsesOf } from '../src/core/catalog.js'
import { fixtureSnapshot } from './helpers/fixture.js'

describe('P4 catalog summary', () => {
  it('aggregates per-sector distributions without judging them', () => {
    const summary = catalogSummary(fixtureSnapshot)
    assert.equal(summary.total_assets, 3)
    // imdb has sector film-industry; squad and speech-data fall back to core
    assert.deepEqual(summary.sectors.map((sector) => sector.sector), ['core', 'film-industry'])
    const core = summary.sectors.find((sector) => sector.sector === 'core')
    assert.equal(core?.assets, 2)
    assert.equal(core?.multi_source, 1) // speech-data (2 sources) — squad is single
    assert.equal(core?.multi_source_rate, 0.5)
  })

  it('splits exact model uses from capped lower bounds', () => {
    const speech = fixtureSnapshot.assets[2]
    assert.ok(speech !== undefined)
    assert.deepEqual(modelUsesOf(speech), { exact: 3, min: 0 })
    const summary = catalogSummary(fixtureSnapshot)
    const core = summary.sectors.find((sector) => sector.sector === 'core')
    assert.equal(core?.assets_with_model_use, 1)
    assert.equal(core?.exact_total, 3)
    assert.equal(core?.min_total, 0)
  })
})
