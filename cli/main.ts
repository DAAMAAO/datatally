#!/usr/bin/env node
/**
 * DataTally CLI — a thin wrapper over the same core the DSH plugin uses.
 *
 *   datatally profile <asset_id>
 *   datatally search <query> [--domain <domain>] [--limit <n>]
 *   datatally compare <asset_id_a> <asset_id_b>
 *   datatally export <asset_id>     AI-BOM fact entry (pure facts, no conclusions)
 *   datatally catalog               per-sector distributions (counts/rates/density)
 *   datatally refresh [options]     fetch all four public sources and write a new snapshot
 *
 * Snapshot location: --snapshot <path> or the DATATALLY_SNAPSHOT env var;
 * defaults to ./data/snapshot_v2.json.
 *
 * Refresh env (adapter channels): DATATALLY_HF_BASE (default https://huggingface.co;
 * use https://hf-mirror.com when hf.co is unreachable), DATATALLY_MODELSCOPE_BASE
 * (default https://modelscope.cn), DATATALLY_GITHUB_TOKEN (optional, raises the
 * GitHub rate limit).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { catalogSummary, renderCatalogText } from '../src/core/catalog.js'
import { buildFactExport } from '../src/core/export.js'
import { buildProfile, compareAssets, requireAsset, searchAssets } from '../src/core/query.js'
import { renderCompareText, renderProfileText, renderSearchText } from '../src/core/render.js'
import { DEFAULT_FAMOUS, DEFAULT_GITHUB_MAP, DEFAULT_QUERIES, refreshSnapshot } from '../src/snapshot/fetchers/pipeline.js'
import { createSnapshotLoader } from '../src/snapshot/loader.js'

const USAGE = [
  'datatally <command> [options]',
  '',
  'commands:',
  '  profile <asset_id>              full usage profile of one asset',
  '  search <query>                 search assets by keyword',
  '  compare <asset_id_a> <asset_id_b>  compare two assets (same signal layer)',
  '  export <asset_id>              AI-BOM fact entry: pure facts, no conclusions',
  '  catalog                        per-sector distributions (multi-source rate, model-use density)',
  '  refresh                        fetch all four public sources and write a new snapshot',
  '',
  'options:',
  '  --domain <domain>   domain filter for search (nlp, vision, audio, ...)',
  '  --limit <n>         search: max results (default 20); refresh: asset count (default 25)',
  '  --top <n>           refresh: top-downloads candidates to consider (default 20)',
  '  --query <text>      refresh: keyword search on HF (repeatable; replaces the default queries)',
  '  --filter <tag>      refresh: tag filter on HF, e.g. task_ids:sentiment-classification (repeatable)',
  '  --block <word>      refresh: reject discovered candidates whose id contains this exact token (repeatable)',
  '  --allow <word>      refresh: when given, discovered candidates must contain an allowlisted token',
  '  --no-curation       refresh: do not load ./data/curated.json',
  '  --snapshot <path>   snapshot file (or env DATATALLY_SNAPSHOT; default ./data/snapshot_v2.json)',
].join('\n')

interface CatalogCliQuery {
  kind: 'search' | 'filter'
  value: string
}

interface CliOptions {
  snapshot: string
  domain?: string
  limit?: number
  top?: number
  queries: CatalogCliQuery[]
  block: string[]
  allow: string[]
  noCuration: boolean
}

function parseArgs(argv: string[]): { command: string; rest: string[]; options: CliOptions } {
  const options: CliOptions = {
    snapshot: process.env.DATATALLY_SNAPSHOT ?? './data/snapshot_v2.json',
    queries: [],
    block: [],
    allow: [],
    noCuration: false,
  }
  const positional: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!
    if (token === '--domain' || token === '--limit' || token === '--snapshot' || token === '--top'
      || token === '--query' || token === '--filter' || token === '--block' || token === '--allow') {
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
      if (token === '--query') options.queries.push({ kind: 'search', value })
      if (token === '--filter') options.queries.push({ kind: 'filter', value })
      if (token === '--block') options.block.push(value)
      if (token === '--allow') options.allow.push(value)
      if (token === '--snapshot') options.snapshot = value
    } else if (token === '--no-curation') {
      options.noCuration = true
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
    if (command === 'profile') {
      const snapshot = await loader.load()
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
      const snapshot = await loader.load()
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
      const snapshot = await loader.load()
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
    if (command === 'export') {
      const snapshot = await loader.load()
      const assetId = rest[0]
      if (assetId === undefined) {
        console.error('datatally: export needs an asset_id\n\n' + USAGE)
        process.exit(2)
      }
      const exportEntry = buildFactExport(snapshot, requireAsset(snapshot, assetId))
      console.log(JSON.stringify(exportEntry, null, 2))
      return
    }
    if (command === 'catalog') {
      const snapshot = await loader.load()
      console.log(renderCatalogText(catalogSummary(snapshot)))
      return
    }
    if (command === 'refresh') {
      const env = {
        fetchFn: fetch,
        hfBase: process.env.DATATALLY_HF_BASE ?? 'https://huggingface.co',
        modelscopeBase: process.env.DATATALLY_MODELSCOPE_BASE ?? 'https://modelscope.cn',
        githubToken: process.env.DATATALLY_GITHUB_TOKEN,
      }
      // Explicit --query/--filter flags replace the shipped default queries —
      // any domain is reachable without a code change.
      const cliQueries = options.queries.map((entry): { search: string; limit: number } | { filter: string; limit: number } => (
        entry.kind === 'search'
          ? { search: entry.value, limit: 10 }
          : { filter: entry.value, limit: 10 }
      ))
      // P2: curation file lives next to the snapshot unless disabled.
      const curationPath = resolve(dirname(resolve(options.snapshot)), 'curated.json')
      const curationConfigured = !options.noCuration && existsSync(curationPath)
      const result = await refreshSnapshot(env, {
        limit: options.limit ?? 25,
        topCount: options.top ?? 20,
        famous: DEFAULT_FAMOUS,
        queries: cliQueries.length > 0 ? cliQueries : DEFAULT_QUERIES,
        queriesFirst: cliQueries.length > 0,
        githubMap: DEFAULT_GITHUB_MAP,
        block: options.block.length > 0 ? options.block : undefined,
        allow: options.allow.length > 0 ? options.allow : undefined,
        curationPath: curationConfigured ? curationPath : undefined,
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
