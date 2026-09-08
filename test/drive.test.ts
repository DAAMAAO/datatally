import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import type { CallId } from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as datatally from '../src/index.js'
import { matchShape } from './helpers/asserts.js'
import { fixtureSnapshot } from './helpers/fixture.js'

describe('drive (keyless, through the real tool pipeline)', () => {
  it('executes all three tools through ctx.tools.execute', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'datatally-drive-'))
    const snapshotPath = join(dir, 'snapshot.json')
    writeFileSync(snapshotPath, JSON.stringify(fixtureSnapshot))
    const ctx = new Context()
    const stopSystemPrompt = ctx.provide('systemPrompt', {
      tools: () => () => {},
      section: () => () => {},
    })
    const toolsFiber = await ctx.plugin(ToolRuntime)
    const pluginFiber = await ctx.plugin(datatally, { snapshotPath, maxResults: 20, enableCitationFields: true })
    try {
      const call = (name: string, args: unknown) => ctx.tools.execute({
        callId: `drive-${name}` as CallId,
        name,
        arguments: args,
        signal: new AbortController().signal,
      })

      const textOf = (blocks: ReadonlyArray<{ type: string; text?: unknown }>): string => {
        const first = blocks[0]
        return first !== undefined && typeof first.text === 'string' ? first.text : ''
      }

      const search = await call('search_assets', { query: 'sentiment' })
      assert.equal(search.isError, false)
      if (!search.isError) {
        matchShape(search.value, [{ asset_id: 'stanfordnlp/imdb', deep_signals: { downloads: 191564 } }])
        assert.ok(textOf(search.content).includes('imdb (stanfordnlp/imdb)'))
      }

      const profile = await call('get_asset_profile', { asset_id: 'stanfordnlp/imdb' })
      assert.equal(profile.isError, false)
      if (!profile.isError) {
        matchShape(profile.value, { asset_id: 'stanfordnlp/imdb', license: null })
        assert.ok(textOf(profile.content).includes('single source only — multi-source aggregation not met'))
      }

      const compare = await call('compare_assets', { asset_id_a: 'stanfordnlp/imdb', asset_id_b: 'rajpurkar/squad' })
      assert.equal(compare.isError, false)
      if (!compare.isError) {
        matchShape(compare.value, {
          comparison: [
            { dimension: 'downloads', signal_layer: 'deep' },
            { dimension: 'likes', signal_layer: 'shallow' },
          ],
        })
      }

      const missing = await call('get_asset_profile', { asset_id: 'nope/nope' })
      assert.equal(missing.isError, true)
      if (missing.isError) {
        assert.ok(missing.error.message.includes('asset not found'))
      }
    } finally {
      await pluginFiber.dispose()
      await toolsFiber.dispose()
      stopSystemPrompt()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
