#!/usr/bin/env node
/**
 * DataTally CLI — a thin wrapper over the same core the DSH plugin uses.
 *
 *   datatally profile <asset_id>
 *   datatally search <query> [--domain <domain>] [--limit <n>]
 *   datatally compare <asset_id_a> <asset_id_b>
 *   datatally refresh [--limit <n>] [--snapshot <path>]
 *
 * Snapshot location: --snapshot <path> or the DATATALLY_SNAPSHOT env var;
 * defaults to ./data/snapshot_v2.json.
 *
 * Refresh env (adapter channels): DATATALLY_HF_BASE (default https://huggingface.co;
 * use https://hf-mirror.com when hf.co is unreachable), DATATALLY_MODELSCOPE_BASE
 * (default https://modelscope.cn), DATATALLY_GITHUB_TOKEN (optional, raises the
 * GitHub rate limit).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { buildProfile, compareAssets, requireAsset, searchAssets } from '../src/core/query.js'
import { renderCompareText, renderProfileText, renderSearchText } from '../src/core/render.js'
import { DEFAULT_FAMOUS, DEFAULT_GITHUB_MAP, refreshSnapshot } from '../src/snapshot/fetchers/pipeline.js'
import { createSnapshotLoader } from '../src/snapshot/loader.js'

const USAGE = [
  'datatally <command> [options]',
  '',
  'commands:',
  '  profile <asset_id>              full usage profile of one asset',
  '  search <query>                 search assets by keyword',
  '  compare <asset_id_a> <asset_id_b>  compare two assets (same signal layer)',
  '  refresh                        fetch all four public sources and write a new snapshot',
  '',
  'options:',
  '  --domain <domain>   domain filter for search (nlp, vision, audio, ...)',
  '  --limit <n>         search: max results (default 20); refresh: asset count (default 10)',
  '  --top <n>           refresh: top-downloads candidates to consider (default 15)',
  '  --snapshot <path>   snapshot file (or env DATATALLY_SNAPSHOT; default ./data/snapshot_v2.json)',
].join('\n')

interface CliOptions {
  snapshot: string
  domain?: string
  limit?: number
  top?: number
}

function parseArgs(argv: string[]): { command: string; rest: string[]; options: CliOptions } {
  const options: CliOptions = { snapshot: process.env.DATATALLY_SNAPSHOT ?? './data/snapshot_v2.json' }
  const positional: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!
    if (token === '--domain' || token === '--limit' || token === '--snapshot' || token === '--top') {
      const value = argv[index + 1]
      if (value === undefined) {
        console.error(`datatally: option ${token} needs a value`)
        process.exit(2)
      }
      index += 1
      if (token === '--domain') options.domain = value
      if (token === '--limit') {
        const parsed = Number(value)
        if (!Number.isFinite(parsed) || parsed <= 0) {
          console.error(`datatally: --limit must be a positive number, got ${JSON.stringify(value)}`)
          process.exit(2)
        }
        options.limit = parsed
      }
      if (token === '--top') {
        const parsed = Number(value)
        if (!Number.isFinite(parsed) || parsed <= 0) {
          console.error(`datatally: --top must be a positive number, got ${JSON.stringify(value)}`)
          process.exit(2)
        }
        options.top = parsed
      }
      if (token === '--snapshot') options.snapshot = value
    } else if (token.startsWith('--')) {
      console.error(`datatally: unknown option ${token}\n\n${USAGE}`)
      process.exit(2)
    } else {
      positional.push(token)
    }
  }
  if (positional.length === 0) {
    console.error(USAGE)
    process.exit(2)
  }
  return { command: positional[0] ?? '', rest: positional.slice(1), options }
}

async function main(): Promise<void> {
  const { command, rest, options } = parseArgs(process.argv.slice(2))
  const loader = createSnapshotLoader(options.snapshot)
  try {
    const snapshot = await loader.load()
    if (command === 'profile') {
      const assetId = rest[0]
      if (assetId === undefined) {
        console.error('datatally: profile needs an asset_id\n\n' + USAGE)
        process.exit(2)
      }
      const asset = requireAsset(snapshot, assetId)
      console.log(renderProfileText(buildProfile(snapshot, asset, { includeCitations: true })))
      return
    }
    if (command === 'search') {
      const query = rest[0]
      if (query === undefined) {
        console.error('datatally: search needs a query\n\n' + USAGE)
        process.exit(2)
      }
      const results = searchAssets(snapshot, query, options.domain, options.limit, options.limit ?? 20)
      console.log(renderSearchText(results))
      return
    }
    if (command === 'compare') {
      const a = rest[0]
      const b = rest[1]
      if (a === undefined || b === undefined) {
        console.error('datatally: compare needs two asset ids\n\n' + USAGE)
        process.exit(2)
      }
      const comparison = compareAssets(requireAsset(snapshot, a), requireAsset(snapshot, b))
      console.log(renderCompareText(comparison))
      return
    }
    if (command === 'refresh') {
      const env = {
        fetchFn: fetch,
        hfBase: process.env.DATATALLY_HF_BASE ?? 'https://huggingface.co',
        modelscopeBase: process.env.DATATALLY_MODELSCOPE_BASE ?? 'https://modelscope.cn',
        githubToken: process.env.DATATALLY_GITHUB_TOKEN,
      }
      const result = await refreshSnapshot(env, {
        limit: options.limit ?? 10,
        topCount: options.top ?? 15,
        famous: DEFAULT_FAMOUS,
        githubMap: DEFAULT_GITHUB_MAP,
      })
      const target = resolve(options.snapshot)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, JSON.stringify(result.snapshot, null, 2))
      writeFileSync(resolve(dirname(target), 'raw_dump.json'), JSON.stringify(result.raw, null, 2))
      for (const line of result.log) console.log(line)
      console.log(`wrote ${result.snapshot.assets.length} assets -> ${target}`)
      return
    }
    console.error(`datatally: unknown command ${JSON.stringify(command)}\n\n${USAGE}`)
    process.exit(2)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`datatally: ${message}`)
    process.exit(1)
  } finally {
    loader.dispose()
  }
}

void main()
