import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { refreshSnapshot } from '../src/snapshot/fetchers/pipeline.js'
import { filterCandidate } from '../src/snapshot/fetchers/pipeline.js'
import type { FetchEnv } from '../src/snapshot/fetchers/util.js'
import { fixtureSnapshot } from './helpers/fixture.js'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

function scriptedEnv(extra: (url: string) => Response | null): FetchEnv {
  const fetchFn = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const custom = extra(url)
    if (custom !== null) return custom
    if (url.startsWith('https://hf.test/api/models')) return json([])
    if (url.includes('filter=') || url.includes('search=')) return json([{ id: 'noise/yolov8n-checkpoints' }, { id: 'f1' }])
    if (url.startsWith('https://hf.test/api/datasets?sort')) return json([{ id: 't1' }])
    if (url.endsWith('/api/datasets/t1')) return json(hfDetail('t1'))
    if (url.endsWith('/api/datasets/f1')) return json(hfDetail('f1'))
    if (url.endsWith('/api/datasets/noise/yolov8n-checkpoints')) return json(hfDetail('noise/yolov8n-checkpoints'))
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  return { fetchFn, hfBase: 'https://hf.test', modelscopeBase: 'https://ms.test' }
}

const baseOptions = {
  limit: 10,
  topCount: 5,
  famous: ['f1'],
  queries: [{ filter: 'task_ids:noise-classification', limit: 2 }],
  githubMap: {},
}

describe('P0 candidate filter', () => {
  it('filterCandidate matches exact tokens of the asset id', () => {
    assert.deepEqual(filterCandidate('duyle2408/levir-yolov8n-p2-cbam', ['yolov8n'], undefined), { pass: false, rule: 'block', word: 'yolov8n' })
    assert.deepEqual(filterCandidate('Inzinion/cbam-sector-facility-registry', ['yolov8n'], undefined), { pass: true })
    assert.deepEqual(filterCandidate('x/y', [], ['allowword']), { pass: false, rule: 'allow', word: 'x/y' })
    assert.deepEqual(filterCandidate('x/allowword-repo', undefined, ['allowword']), { pass: true })
  })

  it('blocks polluted candidates before fetch and logs rule + word', async () => {
    const env = scriptedEnv(() => null)
    const result = await refreshSnapshot(env, { ...baseOptions, block: ['yolov8n', 'checkpoints'] })
    const ids = result.snapshot.assets.map((asset) => asset.asset_id)
    assert.ok(!ids.includes('noise/yolov8n-checkpoints'))
    assert.ok(result.blocked.some((entry) => entry.asset_id === 'noise/yolov8n-checkpoints' && entry.rule === 'block' && entry.word === 'yolov8n'))
    assert.ok(result.log.some((line) => line.includes('BLOCK noise/yolov8n-checkpoints') && line.includes('rule=block')))
  })

  it('allowlist rejects candidates without an allowed token', async () => {
    const env = scriptedEnv(() => null)
    const result = await refreshSnapshot(env, { ...baseOptions, allow: ['noise'] })
    const ids = result.snapshot.assets.map((asset) => asset.asset_id)
    assert.ok(ids.includes('noise/yolov8n-checkpoints'))
    assert.ok(result.blocked.some((entry) => entry.asset_id === 't1' && entry.rule === 'allow'))
  })

  it('famous-list entries are never filtered (curator intent)', async () => {
    const env = scriptedEnv(() => null)
    const result = await refreshSnapshot(env, { ...baseOptions, block: ['f1'] })
    assert.ok(result.snapshot.assets.some((asset) => asset.asset_id === 'f1'))
  })
})

describe('P2 curation file', () => {
  it('loads a curation file and applies github entries to the map', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'datatally-curation-'))
    try {
      const path = join(dir, 'curated.json')
      writeFileSync(path, JSON.stringify({
        version: 1,
        updated_at: '2026-09-08T00:00:00Z',
        entries: [
          { asset_id: 't1', provider: 'github', url: 'https://github.com/org/repo', authority: 'official repo of t1' },
          { asset_id: 'x/y', provider: 'portal', url: 'https://portal.example/xy', authority: 'government statistics portal' },
        ],
      }))
      const env = scriptedEnv((url) => {
        if (url.startsWith('https://api.github.com/repos/org/repo')) return json({ stargazers_count: 5, forks_count: 1 })
        if (url.startsWith('https://api.github.com/repos/org/repo/commits')) return json([{ sha: 'a' }])
        return null
      })
      const result = await refreshSnapshot(env, { ...baseOptions, curationPath: path })
      const t1 = result.snapshot.assets.find((asset) => asset.asset_id === 't1')
      assert.ok(t1?.sources.some((source) => source.source === 'github'))
      assert.equal(result.curation.length, 2)
      assert.ok(result.log.some((line) => line.includes('curation: 2 entries loaded')))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails loud on a missing or malformed curation file', async () => {
    const env = scriptedEnv(() => null)
    await assert.rejects(
      refreshSnapshot(env, { ...baseOptions, curationPath: join(tmpdir(), 'definitely-missing-curated.json') }),
      /curation file not readable/,
    )
    const dir = mkdtempSync(join(tmpdir(), 'datatally-curation-'))
    try {
      const bad = join(dir, 'curated.json')
      writeFileSync(bad, '{ not json')
      await assert.rejects(refreshSnapshot(env, { ...baseOptions, curationPath: bad }), /not valid JSON/)
      const unknownKey = join(dir, 'curated2.json')
      writeFileSync(unknownKey, JSON.stringify({ version: 1, updated_at: 'x', entries: [{ asset_id: 'a', provider: 'github', url: 'https://github.com/o/r', authority: 'x', extra: 1 }] }))
      await assert.rejects(refreshSnapshot(env, { ...baseOptions, curationPath: unknownKey }), /unknown field/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// keep fixtureSnapshot import used for future curation-in-pipeline fixtures
void fixtureSnapshot
