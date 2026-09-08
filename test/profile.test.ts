import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildProfile, requireAsset } from '../src/core/query.js'
import { matchShape } from './helpers/asserts.js'
import { fixtureSnapshot } from './helpers/fixture.js'

describe('profile core', () => {
  it('projects every profile field from the record', () => {
    const asset = requireAsset(fixtureSnapshot, 'stanfordnlp/imdb')
    const profile = buildProfile(fixtureSnapshot, asset, { includeCitations: true })
    matchShape(profile, {
      asset_id: 'stanfordnlp/imdb',
      name: 'imdb',
      access: 'open',
      license: null,
      verification: 'public_api',
      snapshot_version: '2',
      citations: [],
    })
    assert.deepEqual(profile.deep_signals, [
      { source: 'huggingface', metric: 'downloads', value: 191564, fetched_at: '2026-09-06T12:00:00Z' },
    ])
    assert.deepEqual(profile.shallow_signals, [
      { source: 'huggingface', metric: 'likes', value: 709, fetched_at: '2026-09-06T12:00:00Z' },
    ])
    assert.equal(profile.timeline.length, 1)
  })

  it('passes a missing license through as null — never a fabricated default', () => {
    const asset = requireAsset(fixtureSnapshot, 'stanfordnlp/imdb')
    assert.equal(buildProfile(fixtureSnapshot, asset, { includeCitations: true }).license, null)
  })

  it('marks single-source assets explicitly', () => {
    const imdb = requireAsset(fixtureSnapshot, 'stanfordnlp/imdb')
    assert.ok(buildProfile(fixtureSnapshot, imdb, { includeCitations: true }).profile_summary
      .includes('single source only — multi-source aggregation not met'))
  })

  it('does not mark multi-source assets', () => {
    const speech = requireAsset(fixtureSnapshot, 'org/speech-data')
    assert.ok(!buildProfile(fixtureSnapshot, speech, { includeCitations: true }).profile_summary
      .includes('single source only'))
  })

  it('projects citation fields and honors the citation toggle', () => {
    const squad = requireAsset(fixtureSnapshot, 'rajpurkar/squad')
    const withCitations = buildProfile(fixtureSnapshot, squad, { includeCitations: true })
    assert.deepEqual(withCitations.citations, [
      { title: 'SQuAD: 100,000+ Questions for Machine Comprehension of Text', year: '2016', venue: 'EMNLP' },
    ])
    const withoutCitations = buildProfile(fixtureSnapshot, squad, { includeCitations: false })
    assert.equal('citations' in withoutCitations, false)
  })

  it('treats a missing asset as an error, not an empty result', () => {
    assert.throws(() => requireAsset(fixtureSnapshot, 'nope/nope'), /asset not found/)
  })
})
