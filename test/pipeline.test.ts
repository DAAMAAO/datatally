import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { refreshSnapshot } from '../src/snapshot/fetchers/pipeline.js'
import type { FetchEnv } from '../src/snapshot/fetchers/util.js'

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status })

const hfDetail = (id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  gated: false,
  disabled: false,
  private: false,
  downloads: 1000,
  likes: 42,
  tags: ['modality:text'],
  description: 'demo',
  cardData: {},
  ...overrides,
})

/**
 * Scripted four-source world:
 * - HF top list: t1, t2 (gated at detail), t3
 * - famous: f1 — has a DataCite DOI and a curated GitHub repo, mirrored on ModelScope
 */
function scriptedEnv(): FetchEnv {
  const fetchFn = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (url.startsWith('https://hf.test/api/datasets?sort')) {
      return json([{ id: 't1' }, { id: 't2' }, { id: 't3' }])
    }
    if (url.startsWith('https://hf.test/api/models')) return json([])
    if (url.endsWith('/api/datasets/f1')) {
      return json(hfDetail('f1', { cardData: { license: 'cc-by-4.0', citation: 'doi = {10.5281/zenodo.1},' } }))
    }
    if (url.endsWith('/api/datasets/t1')) return json(hfDetail('t1'))
    if (url.endsWith('/api/datasets/t2')) return json(hfDetail('t2', { gated: true }))
    if (url.endsWith('/api/datasets/t3')) return json(hfDetail('t3'))
    if (url.startsWith('https://ms.test/openapi/v1/datasets/modelscope/f1')) {
      return json({ data: { downloads: 500, likes: 7, gated: false } })
    }
    if (url.startsWith('https://ms.test/')) return new Response('{}', { status: 404 })
    if (url.startsWith('https://api.datacite.org/dois/10.5281%2Fzenodo.1')) {
      return json({ data: { attributes: { citationCount: 12 } } })
    }
    if (url.startsWith('https://api.github.com/repos/org/f1repo')) {
      return json({ stargazers_count: 1200, forks_count: 300 })
    }
    if (url.startsWith('https://api.github.com/repos/org/f1repo/commits')) {
      return json([{ sha: 'abc' }], 200)
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  return { fetchFn, hfBase: 'https://hf.test', modelscopeBase: 'https://ms.test' }
}

const options = {
  limit: 10,
  topCount: 15,
  famous: ['f1'],
  queries: [] as readonly never[],
  githubMap: { f1: 'org/f1repo' },
}

describe('refresh pipeline', () => {
  it('merges all four sources where they answer, in deterministic order', async () => {
    const result = await refreshSnapshot(scriptedEnv(), options)
    assert.deepEqual(result.log[0], 'f1 :: sources=huggingface+modelscope+datacite+github')
    const f1 = result.snapshot.assets[0]!
    assert.deepEqual(f1.sources.map((source) => source.source), ['huggingface', 'modelscope', 'datacite', 'github'])
    assert.deepEqual(f1.sources[1]?.metrics.downloads, { value: 500, signal_type: 'deep' })
    assert.deepEqual(f1.sources[2]?.metrics.citations, { value: 12, signal_type: 'deep' })
    assert.deepEqual(f1.sources[3]?.metrics.stars, { value: 1200, signal_type: 'shallow' })
  })

  it('skips gated candidates and keeps single-source assets single', async () => {
    const result = await refreshSnapshot(scriptedEnv(), options)
    const ids = result.snapshot.assets.map((asset) => asset.asset_id)
    assert.deepEqual(ids, ['f1', 't1', 't3'])
    const t1 = result.snapshot.assets[1]!
    assert.deepEqual(t1.sources.map((source) => source.source), ['huggingface'])
    assert.ok(result.log.includes('t1 :: sources=huggingface'))
  })

  it('produces a valid v2 snapshot with provenance on every asset', async () => {
    const result = await refreshSnapshot(scriptedEnv(), options)
    assert.equal(result.snapshot.version, '2')
    assert.ok(result.snapshot.generated_at.length > 0)
    for (const asset of result.snapshot.assets) {
      assert.equal(asset.verification, 'public_api')
      assert.equal(asset.access, 'open')
      assert.ok(asset.sources.length >= 1)
      assert.ok((asset.sources[0]?.fetched_at ?? '').length > 0)
      assert.ok(asset.timeline.length >= 1)
    }
    assert.equal(result.raw.length, result.snapshot.assets.length)
  })

  it('caps the asset count at the configured limit', async () => {
    const result = await refreshSnapshot(scriptedEnv(), { ...options, limit: 2 })
    assert.equal(result.snapshot.assets.length, 2)
  })

  it('injects catalog queries after the famous list and dedupes them', async () => {
    const env = scriptedEnv()
    const originalFetch = env.fetchFn
    env.fetchFn = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('filter=task_ids%3Asentiment-classification')) {
        return json([{ id: 'q1' }, { id: 'f1' }])
      }
      if (url.endsWith('/api/datasets/q1')) return json(hfDetail('q1'))
      return originalFetch(input)
    }) as typeof fetch
    const result = await refreshSnapshot(env, {
      ...options,
      queries: [{ filter: 'task_ids:sentiment-classification', limit: 2 }],
    })
    const ids = result.snapshot.assets.map((asset) => asset.asset_id)
    assert.deepEqual(ids, ['f1', 'q1', 't1', 't3'])
  })

  it('leads with explicit queries when queriesFirst is set', async () => {
    const env = scriptedEnv()
    const originalFetch = env.fetchFn
    env.fetchFn = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('search=protein')) {
        return json([{ id: 'q1' }])
      }
      if (url.endsWith('/api/datasets/q1')) return json(hfDetail('q1'))
      return originalFetch(input)
    }) as typeof fetch
    const result = await refreshSnapshot(env, {
      ...options,
      limit: 3,
      queries: [{ search: 'protein', limit: 1 }],
      queriesFirst: true,
    })
    const ids = result.snapshot.assets.map((asset) => asset.asset_id)
    assert.deepEqual(ids, ['q1', 'f1', 't1'])
  })

  it('tolerates a failing catalog query without losing the record', async () => {
    const env = scriptedEnv()
    const originalFetch = env.fetchFn
    env.fetchFn = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('filter=task_ids')) return new Response('boom', { status: 500 })
      return originalFetch(input)
    }) as typeof fetch
    const result = await refreshSnapshot(env, {
      ...options,
      queries: [{ filter: 'task_ids:whatever', limit: 2 }],
    })
    const ids = result.snapshot.assets.map((asset) => asset.asset_id)
    assert.deepEqual(ids, ['f1', 't1', 't3'])
  })
})
