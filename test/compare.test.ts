import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { compareAssets, requireAsset } from '../src/core/query.js'
import { matchShape } from './helpers/asserts.js'
import { fixtureSnapshot } from './helpers/fixture.js'

describe('compare core', () => {
  const imdb = () => requireAsset(fixtureSnapshot, 'stanfordnlp/imdb')
  const squad = () => requireAsset(fixtureSnapshot, 'rajpurkar/squad')
  const speech = () => requireAsset(fixtureSnapshot, 'org/speech-data')

  it('declares signal_layer, same_source, and same_access per dimension', () => {
    const result = compareAssets(imdb(), squad())
    assert.deepEqual(result.comparison, [
      { dimension: 'downloads', signal_layer: 'deep', a_value: 191564, b_value: 263988, same_source: true, same_access: true },
      { dimension: 'likes', signal_layer: 'shallow', a_value: 709, b_value: 718, same_source: true, same_access: true },
    ])
    assert.equal(result.note, '')
    assert.deepEqual(result.a, { asset_id: 'stanfordnlp/imdb', name: 'imdb', access: 'open' })
    assert.deepEqual(result.b, { asset_id: 'rajpurkar/squad', name: 'squad', access: 'open' })
  })

  it('never compares a star against a download — dimensions are per metric and per layer', () => {
    const result = compareAssets(imdb(), squad())
    for (const dimension of result.comparison) {
      const expectedLayer = dimension.dimension === 'likes' || dimension.dimension === 'stars' ? 'shallow' : 'deep'
      assert.equal(dimension.signal_layer, expectedLayer)
    }
    assert.ok(!result.comparison.map((dimension) => dimension.dimension).includes('stars'))
  })

  it('flags cross-source dimensions and notes the boundary', () => {
    const result = compareAssets(imdb(), speech())
    const citations = result.comparison.find((dimension) => dimension.dimension === 'citations')
    assert.ok(citations !== undefined)
    assert.equal(citations?.same_source, false)
    assert.equal(citations?.same_access, true)
    assert.equal(result.note, 'cross-source metrics are not directly comparable')
  })

  it('compares multi-source totals within one layer', () => {
    const result = compareAssets(speech(), imdb())
    const downloads = result.comparison.find((dimension) => dimension.dimension === 'downloads')
    matchShape(downloads, { signal_layer: 'deep', a_value: 1000, b_value: 191564, same_source: true })
  })

  it('propagates missing-asset errors from both sides', () => {
    assert.throws(() => compareAssets(requireAsset(fixtureSnapshot, 'nope/a'), squad()), /asset not found/)
  })
})
