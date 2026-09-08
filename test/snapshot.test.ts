import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildProfile, compareAssets, requireAsset, searchAssets } from '../src/core/query.js'
import { renderCompareText, renderProfileText, renderSearchText } from '../src/core/render.js'
import { matchShape } from './helpers/asserts.js'
import { fixtureSnapshot } from './helpers/fixture.js'

/**
 * Recorded-session snapshots: golden text of standard calls, derived only from
 * the canonical values. Any change to projection breaks these records loudly.
 */
describe('recorded outputs', () => {
  it('records the canonical search projection', () => {
    const value = searchAssets(fixtureSnapshot, 'sentiment', undefined, undefined, 20)
    matchShape(value, [{
      asset_id: 'stanfordnlp/imdb',
      deep_signals: { downloads: 191564, citations: 0, forks: 0 },
      shallow_signals: { stars: 0, likes: 709 },
      fetched_at: '2026-09-06T12:00:00Z',
      snapshot_version: '2',
    }])
    assert.equal(renderSearchText(value),
      '- imdb (stanfordnlp/imdb) | domain: nlp | access: open'
      + ' | deep: downloads 191564, citations 0, forks 0'
      + ' | shallow: likes 709, stars 0'
      + ' | fetched_at: 2026-09-06T12:00:00Z | snapshot: v2')
  })

  it('records the canonical profile projection', () => {
    const asset = requireAsset(fixtureSnapshot, 'stanfordnlp/imdb')
    const value = buildProfile(fixtureSnapshot, asset, { includeCitations: true })
    assert.equal(renderProfileText(value), [
      'imdb (stanfordnlp/imdb)',
      'access: open | license: null | verification: public_api | snapshot: v2',
      'deep signals (actual use):',
      '  - downloads: 191564 (source: huggingface, fetched_at: 2026-09-06T12:00:00Z)',
      'shallow signals (interest only):',
      '  - likes: 709 (source: huggingface, fetched_at: 2026-09-06T12:00:00Z)',
      'timeline:',
      '  - 2026-09 downloads: 191564 (source: huggingface, deep)',
      'citations:',
      '  (none recorded)',
      'profile summary: Usage profile for imdb (nlp), open access under no license recorded, verified via public_api. Recorded from 1 source at 2026-09-06T12:00:00Z (snapshot version 2). single source only — multi-source aggregation not met',
    ].join('\n'))
  })

  it('records the canonical compare projection', () => {
    const value = compareAssets(requireAsset(fixtureSnapshot, 'stanfordnlp/imdb'), requireAsset(fixtureSnapshot, 'rajpurkar/squad'))
    assert.equal(renderCompareText(value), [
      'comparing imdb (stanfordnlp/imdb) vs squad (rajpurkar/squad)',
      '- downloads [deep]: 191564 vs 263988 | same_source: true | same_access: true',
      '- likes [shallow]: 709 vs 718 | same_source: true | same_access: true',
    ].join('\n'))
  })
})
