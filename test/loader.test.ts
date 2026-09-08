import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SnapshotValidationError } from '../src/schema/snapshot.schema.js'
import { createSnapshotLoader } from '../src/snapshot/loader.js'
import { fixtureSnapshot } from './helpers/fixture.js'

async function withDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'datatally-loader-'))
  try {
    await run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('snapshot loader', () => {
  it('loads a valid v2 snapshot and caches it', async () => {
    await withDir(async (dir) => {
      const path = join(dir, 'snapshot.json')
      writeFileSync(path, JSON.stringify(fixtureSnapshot))
      const loader = createSnapshotLoader(path)
      const first = await loader.load()
      const second = await loader.load()
      assert.equal(first.version, '2')
      assert.equal(first.assets.length, 3)
      assert.equal(second, first) // cached instance
      loader.dispose()
    })
  })

  it('rejects v1 snapshots with a migration pointer', async () => {
    await withDir(async (dir) => {
      const path = join(dir, 'snapshot.json')
      writeFileSync(path, JSON.stringify({ ...fixtureSnapshot, version: '1' }))
      const loader = createSnapshotLoader(path)
      await assert.rejects(loader.load(), /unsupported snapshot version "1".*migration/s)
    })
  })

  it('fails loud on corrupted JSON', async () => {
    await withDir(async (dir) => {
      const path = join(dir, 'snapshot.json')
      writeFileSync(path, '{ not json')
      await assert.rejects(createSnapshotLoader(path).load(), /not valid JSON/)
    })
  })

  it('fails loud on a missing file — never silent empty data', async () => {
    const loader = createSnapshotLoader(join(tmpdir(), 'datatally-definitely-missing.json'))
    await assert.rejects(loader.load(), /not readable/)
  })

  it('rejects malformed asset entries', async () => {
    await withDir(async (dir) => {
      const path = join(dir, 'snapshot.json')
      writeFileSync(path, JSON.stringify({
        version: '2',
        generated_at: 'x',
        assets: [{
          asset_id: 'a',
          id_type: 'hf',
          name: 'a',
          domain: 'other',
          access: 'open',
          license: null,
          verification: 'public_api',
          timeline: [],
          citations: [],
        }],
      }))
      await assert.rejects(createSnapshotLoader(path).load(), /sources must be an array/)
    })
  })

  it('rejects the legacy asset_class field (regression guard)', async () => {
    await withDir(async (dir) => {
      const path = join(dir, 'snapshot.json')
      const legacy = { ...fixtureSnapshot.assets[0], asset_class: 'dataset' }
      writeFileSync(path, JSON.stringify({ ...fixtureSnapshot, assets: [legacy] }))
      const loader = createSnapshotLoader(path)
      await assert.rejects(loader.load(), SnapshotValidationError)
      await assert.rejects(loader.load(), /asset_class/)
    })
  })

  it('rejects unknown snapshot-level fields', async () => {
    await withDir(async (dir) => {
      const path = join(dir, 'snapshot.json')
      writeFileSync(path, JSON.stringify({ ...fixtureSnapshot, extra: true }))
      await assert.rejects(createSnapshotLoader(path).load(), /unknown field "extra"/)
    })
  })

  it('accepts license null and optional tags/description', async () => {
    await withDir(async (dir) => {
      const path = join(dir, 'snapshot.json')
      const stripped = {
        ...fixtureSnapshot,
        assets: [{
          ...fixtureSnapshot.assets[0],
          tags: undefined,
          description: undefined,
          license: null,
        }],
      }
      writeFileSync(path, JSON.stringify(stripped))
      const snapshot = await createSnapshotLoader(path).load()
      assert.equal(snapshot.assets[0]?.license, null)
    })
  })

  it('honors an aborted signal', async () => {
    await withDir(async (dir) => {
      const path = join(dir, 'snapshot.json')
      writeFileSync(path, JSON.stringify(fixtureSnapshot))
      const controller = new AbortController()
      controller.abort()
      await assert.rejects(createSnapshotLoader(path).load(controller.signal), /not readable/)
    })
  })
})
