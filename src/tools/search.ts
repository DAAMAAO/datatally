import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { searchAssets } from '../core/query.js'
import { renderSearchText } from '../core/render.js'
import type { SnapshotLoader } from '../snapshot/loader.js'
import type { AssetSearchSummary } from '../snapshot/types.js'

export interface SearchToolOptions {
  maxResults: number
}

/** `search_assets`: search data asset profiles by keyword or domain. */
export function registerSearchTool(loader: SnapshotLoader, options: SearchToolOptions): ToolDefinition {
  return defineTool({
    name: 'search_assets',
    description: 'Search DataTally data asset profiles by keyword or domain. Deep signals (downloads, citations, forks) reflect actual use; shallow signals (stars, likes) reflect interest only. Every metric carries its source, fetch time, and snapshot version. DataTally records; you judge.',
    parameters: {
      query: {
        type: 'string',
        description: 'Keyword matched against asset name, id, domain, tags, and description.',
        required: true,
      },
      domain: {
        type: 'string',
        description: 'Optional domain filter: nlp, vision, audio, tabular, code, other.',
      },
      limit: {
        type: 'number',
        description: `Maximum number of results (default ${options.maxResults}, capped at ${options.maxResults}).`,
      },
    },
    output: {
      schema: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            asset_id: { type: 'string' },
            name: { type: 'string' },
            domain: { type: 'string' },
            access: { type: 'string' },
            deep_signals: {
              type: 'object',
              additionalProperties: false,
              properties: {
                downloads: { type: 'number' },
                citations: { type: 'number' },
                forks: { type: 'number' },
              },
            },
            shallow_signals: {
              type: 'object',
              additionalProperties: false,
              properties: {
                stars: { type: 'number' },
                likes: { type: 'number' },
              },
            },
            fetched_at: { type: 'string' },
            snapshot_version: { type: 'string' },
          },
        },
      },
      render: (_args, value): ContentBlock[] => [
        { type: 'text', text: renderSearchText(value as AssetSearchSummary[]) },
      ],
    },
    async execute(args, exec) {
      const snapshot = await loader.load(exec.signal)
      return searchAssets(snapshot, args.query, args.domain, args.limit, options.maxResults)
    },
    presentCall(args) {
      return { card: 'generic', title: 'search_assets', kind: 'search', rawInput: { query: args.query, domain: args.domain } }
    },
    presentResult(_args, { content }) {
      return { card: 'generic', title: 'search_assets', content }
    },
  })
}
