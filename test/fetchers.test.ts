import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { findDoi, fetchDataciteCitations } from '../src/snapshot/fetchers/datacite.js'
import { fetchGithub } from '../src/snapshot/fetchers/github.js'
import { fetchHfAsset, fetchHfTop } from '../src/snapshot/fetchers/hf.js'
import { fetchModelscopeMirror } from '../src/snapshot/fetchers/modelscope.js'
import type { FetchEnv } from '../src/snapshot/fetchers/util.js'

const json = (data: unknown, status = 200, headers?: Record<string, string>): Response =>
  new Response(JSON.stringify(data), { status, headers })

type Handler = (url: string) => Response | Promise<Response>

function fakeEnv(handler: Handler): FetchEnv {
  const fetchFn = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    return handler(url)
  }) as typeof fetch
  return { fetchFn, hfBase: 'https://hf.test', modelscopeBase: 'https://ms.test' }
}

const hfDetail = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'org/demo',
  gated: false,
  disabled: false,
  private: false,
  downloads: 1000,
  likes: 42,
  tags: ['task_ids:sentiment-classification', 'modality:text'],
  description: 'A demo dataset for sentiment classification.',
  cardData: { license: 'mit', citation: '@article{x, doi={10.5281/zenodo.1234567}}' },
  ...overrides,
})

describe('huggingface adapter', () => {
  it('lists top datasets, skipping gated/disabled/private entries', async () => {
    const env = fakeEnv(() => json([
      { id: 'a/open', gated: false },
      { id: 'b/gated', gated: true },
      { id: 'c/disabled', disabled: true },
      { id: 'd/private', private: true },
      { id: 'e/open2' },
    ]))
    assert.deepEqual(await fetchHfTop(env, 10), ['a/open', 'e/open2'])
  })

  it('builds a full asset record with real model-uses count', async () => {
    const env = fakeEnv((url) => {
      if (url.startsWith('https://hf.test/api/models')) return json([{ id: 'm1' }, { id: 'm2' }])
      return json(hfDetail())
    })
    const record = await fetchHfAsset(env, 'org/demo')
    assert.ok(record !== null)
    if (record === null) return
    assert.equal(record.asset_id, 'org/demo')
    assert.equal(record.name, 'demo')
    assert.equal(record.domain, 'nlp')
    assert.equal(record.license, 'mit')
    assert.equal(record.cardCitation, '@article{x, doi={10.5281/zenodo.1234567}}')
    assert.deepEqual(record.sources[0]?.metrics.downloads, { value: 1000, signal_type: 'deep' })
    assert.deepEqual(record.sources[0]?.metrics.likes, { value: 42, signal_type: 'shallow' })
    assert.deepEqual(record.sources[0]?.metrics.model_uses, { value: 2, signal_type: 'deep' })
  })

  it('omits model_uses when the models endpoint cannot answer — no fabricated zero', async () => {
    const env = fakeEnv((url) => {
      if (url.startsWith('https://hf.test/api/models')) return new Response('boom', { status: 500 })
      return json(hfDetail())
    })
    const record = await fetchHfAsset(env, 'org/demo')
    assert.equal(record?.sources[0]?.metrics.model_uses, undefined)
  })

  it('records a capped model-uses count as an honest lower bound', async () => {
    const env = fakeEnv((url) => {
      if (url.startsWith('https://hf.test/api/models')) {
        return json(Array.from({ length: 500 }, (_, i) => ({ id: 'm' + i })))
      }
      return json(hfDetail())
    })
    const record = await fetchHfAsset(env, 'org/demo')
    assert.deepEqual(record?.sources[0]?.metrics.model_uses_min, { value: 500, signal_type: 'deep' })
    assert.equal(record?.sources[0]?.metrics.model_uses, undefined)
  })

  it('returns null for gated or absent assets', async () => {
    const env = fakeEnv((url) => {
      if (url.endsWith('/api/datasets/org/gated')) return json(hfDetail({ gated: true }))
      return new Response('{}', { status: 404 })
    })
    assert.equal(await fetchHfAsset(env, 'org/gated'), null)
    assert.equal(await fetchHfAsset(env, 'org/missing'), null)
  })
})

describe('modelscope adapter', () => {
  it('probes mirror owners and takes the first open hit', async () => {
    const env = fakeEnv((url) => {
      if (url.includes('/AI-ModelScope/demo')) return new Response('{}', { status: 404 })
      if (url.includes('/modelscope/demo')) return json({ data: { downloads: 500, likes: 7, gated: false } })
      return new Response('{}', { status: 404 })
    })
    const mirror = await fetchModelscopeMirror(env, 'demo')
    assert.deepEqual(mirror?.metrics.downloads, { value: 500, signal_type: 'deep' })
    assert.deepEqual(mirror?.metrics.likes, { value: 7, signal_type: 'shallow' })
    assert.equal(mirror?.source, 'modelscope')
  })

  it('skips gated mirrors and returns null when nothing matches', async () => {
    const env = fakeEnv(() => json({ data: { downloads: 500, gated: true } }))
    assert.equal(await fetchModelscopeMirror(env, 'demo'), null)
  })
})

describe('datacite adapter', () => {
  it('extracts a DOI from citation text', () => {
    assert.equal(findDoi(null), null)
    assert.equal(findDoi('@article{x, doi = {10.5281/zenodo.1234567},}'), '10.5281/zenodo.1234567')
    assert.equal(findDoi('no doi here'), null)
  })

  it('returns the citation count with source provenance', async () => {
    const env = fakeEnv(() => json({ data: { attributes: { citationCount: 12 } } }))
    const result = await fetchDataciteCitations(env, '10.5281/zenodo.1234567')
    assert.deepEqual(result?.metrics.citations, { value: 12, signal_type: 'deep' })
    assert.equal(result?.source, 'datacite')
  })

  it('returns null on failure — no fabricated zero', async () => {
    const broken = fakeEnv(() => new Response('{}', { status: 500 }))
    assert.equal(await fetchDataciteCitations(broken, '10.5281/zenodo.1'), null)
    const missing = fakeEnv(() => json({ data: { attributes: {} } }))
    assert.equal(await fetchDataciteCitations(missing, '10.5281/zenodo.1'), null)
  })
})

describe('github adapter', () => {
  it('records stars (shallow), forks and commits (deep)', async () => {
    const env = fakeEnv((url) => {
      if (url.includes('/commits')) {
        return json([{ sha: 'abc' }], 200, { link: '<https://api.github.com/x?page=42>; rel="last"' })
      }
      return json({ stargazers_count: 1200, forks_count: 300 })
    })
    const result = await fetchGithub(env, 'org/repo')
    assert.deepEqual(result?.metrics.stars, { value: 1200, signal_type: 'shallow' })
    assert.deepEqual(result?.metrics.forks, { value: 300, signal_type: 'deep' })
    assert.deepEqual(result?.metrics.commits, { value: 42, signal_type: 'deep' })
  })

  it('falls back to the returned entry count without a Link header', async () => {
    const env = fakeEnv((url) => {
      if (url.includes('/commits')) return json([{ sha: 'abc' }])
      return json({ stargazers_count: 5, forks_count: 1 })
    })
    const result = await fetchGithub(env, 'org/repo')
    assert.deepEqual(result?.metrics.commits, { value: 1, signal_type: 'deep' })
  })

  it('returns null for missing repos', async () => {
    const env = fakeEnv(() => new Response('{}', { status: 404 }))
    assert.equal(await fetchGithub(env, 'org/nope'), null)
  })
})
