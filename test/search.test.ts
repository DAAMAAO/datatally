import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { matchesQuery, searchAssets } from '../src/core/query.js'
import { fixtureSnapshot } from './helpers/fixture.js'

describe('search core', () => {
  it('matches keywords through tags and description', () => {
    const hits = searchAssets(fixtureSnapshot, 'sentiment', undefined, undefined, 20)
    assert.deepEqual(hits.map((hit) => hit.asset_id), ['stanfordnlp/imdb'])
  })

  it('normalizes separators for multi-word queries', () => {
    const hits = searchAssets(fixtureSnapshot, 'sentiment classification', undefined, undefined, 20)
    assert.deepEqual(hits.map((hit) => hit.asset_id), ['stanfordnlp/imdb'])
  })

  it('matches question answering to squad', () => {
    const hits = searchAssets(fixtureSnapshot, 'question answering', undefined, undefined, 20)
    assert.deepEqual(hits.map((hit) => hit.asset_id), ['rajpurkar/squad'])
  })

  it('applies the domain filter', () => {
    const hits = searchAssets(fixtureSnapshot, 'speech', 'audio', undefined, 20)
    assert.deepEqual(hits.map((hit) => hit.asset_id), ['org/speech-data'])
    assert.deepEqual(searchAssets(fixtureSnapshot, 'speech', 'nlp', undefined, 20), [])
  })

  it('keeps snapshot order — never sorts by usage', () => {
    const hits = searchAssets(fixtureSnapshot, '', undefined, undefined, 2)
    assert.deepEqual(hits.map((hit) => hit.asset_id), ['stanfordnlp/imdb', 'rajpurkar/squad'])
  })

  it('returns an empty array, not an error, when nothing matches', () => {
    assert.deepEqual(searchAssets(fixtureSnapshot, 'zzz-none', undefined, undefined, 20), [])
  })

  it('caps results at the config maximum', () => {
    const hits = searchAssets(fixtureSnapshot, '', undefined, 100, 2)
    assert.equal(hits.length, 2)
  })

  it('separates deep and shallow signals and sums across sources', () => {
    const [imdb] = searchAssets(fixtureSnapshot, 'imdb', undefined, undefined, 20)
    assert.deepEqual(imdb?.deep_signals, { downloads: 191564, citations: 0, forks: 0 })
    assert.deepEqual(imdb?.shallow_signals, { stars: 0, likes: 709 })
    const [speech] = searchAssets(fixtureSnapshot, 'speech-data', undefined, undefined, 20)
    assert.equal(speech?.deep_signals.citations, 42)
    assert.equal(speech?.shallow_signals.likes, 50)
    assert.equal(speech?.fetched_at, '2026-09-06T12:00:00Z')
  })

  it('declares provenance on every summary', () => {
    const [imdb] = searchAssets(fixtureSnapshot, 'imdb', undefined, undefined, 20)
    assert.equal(imdb?.snapshot_version, '2')
    assert.equal(imdb?.fetched_at, '2026-09-06T12:00:00Z')
  })

  it('matchesQuery is literal and predictable', () => {
    const imdb = fixtureSnapshot.assets[0]
    assert.ok(imdb !== undefined)
    if (imdb === undefined) return
    assert.equal(matchesQuery(imdb, 'MOVIE REVIEWS'), true)
    assert.equal(matchesQuery(imdb, 'movie-review'), true)
    assert.equal(matchesQuery(imdb, 'zzz'), false)
    assert.equal(matchesQuery(imdb, ''), true)
  })
})
