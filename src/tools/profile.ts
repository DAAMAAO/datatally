import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { buildProfile, requireAsset } from '../core/query.js'
import { renderProfileText } from '../core/render.js'
import { asAssetId } from '../snapshot/brand.js'
import type { SnapshotLoader } from '../snapshot/loader.js'
import type { AssetProfile } from '../snapshot/types.js'

export interface ProfileToolOptions {
  enableCitationFields: boolean
}

/** `get_asset_profile`: full usage profile of one asset, with provenance. */
export function registerProfileTool(loader: SnapshotLoader, options: ProfileToolOptions): ToolDefinition {
  return defineTool({
    name: 'get_asset_profile',
    description: 'Get the full DataTally usage profile of one data asset: per-source metrics with provenance, timeline, and citations. Deep signals reflect actual use; shallow signals reflect interest only. A missing asset is an error. DataTally records; you judge.',
    parameters: {
      asset_id: {
        type: 'string',
        description: 'HF dataset id (e.g. stanfordnlp/imdb) or other registry id.',
        required: true,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          asset_id: { type: 'string' },
          name: { type: 'string' },
          access: { type: 'string' },
          license: { oneOf: [{ type: 'string' }, { type: 'null' }] },
          verification: { type: 'string' },
          deep_signals: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                source: { type: 'string' },
                metric: { type: 'string' },
                value: { type: 'number' },
                fetched_at: { type: 'string' },
              },
            },
          },
          shallow_signals: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                source: { type: 'string' },
                metric: { type: 'string' },
                value: { type: 'number' },
                fetched_at: { type: 'string' },
              },
            },
          },
          timeline: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                date: { type: 'string' },
                metric: { type: 'string' },
                value: { type: 'number' },
                source: { type: 'string' },
                signal_type: { type: 'string' },
              },
            },
          },
          citations: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                title: { type: 'string' },
                year: { type: 'string' },
                venue: { type: 'string' },
              },
            },
          },
          profile_summary: { type: 'string' },
          snapshot_version: { type: 'string' },
        },
      },
      render: (_args, value): ContentBlock[] => [
        { type: 'text', text: renderProfileText(value as AssetProfile) },
      ],
    },
    async execute(args, exec) {
      const snapshot = await loader.load(exec.signal)
      const asset = requireAsset(snapshot, asAssetId(args.asset_id))
      return buildProfile(snapshot, asset, { includeCitations: options.enableCitationFields })
    },
    presentCall(args) {
      return { card: 'generic', title: `get_asset_profile: ${args.asset_id}`, kind: 'read' }
    },
    presentResult(_args, { content }) {
      return { card: 'generic', title: 'get_asset_profile', content }
    },
  })
}
