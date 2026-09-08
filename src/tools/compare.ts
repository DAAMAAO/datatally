import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { compareAssets, requireAsset } from '../core/query.js'
import { renderCompareText } from '../core/render.js'
import { asAssetId } from '../snapshot/brand.js'
import type { SnapshotLoader } from '../snapshot/loader.js'
import type { AssetComparison } from '../snapshot/types.js'

/** `compare_assets`: same-layer, same-category comparison of two assets. */
export function registerCompareTool(loader: SnapshotLoader): ToolDefinition {
  return defineTool({
    name: 'compare_assets',
    description: 'Compare usage profiles of two DataTally data assets. Comparison is only made within the same signal layer (deep vs deep, shallow vs shallow) and the same evidence category (same access, where possible same source). DataTally records; you judge.',
    parameters: {
      asset_id_a: { type: 'string', description: 'First asset id (HF dataset id).', required: true },
      asset_id_b: { type: 'string', description: 'Second asset id (HF dataset id).', required: true },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          a: {
            type: 'object',
            additionalProperties: false,
            properties: {
              asset_id: { type: 'string' },
              name: { type: 'string' },
              access: { type: 'string' },
            },
          },
          b: {
            type: 'object',
            additionalProperties: false,
            properties: {
              asset_id: { type: 'string' },
              name: { type: 'string' },
              access: { type: 'string' },
            },
          },
          comparison: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                dimension: { type: 'string' },
                signal_layer: { type: 'string' },
                a_value: { type: 'number' },
                b_value: { type: 'number' },
                same_source: { type: 'boolean' },
                same_access: { type: 'boolean' },
              },
            },
          },
          note: { type: 'string' },
        },
      },
      render: (_args, value): ContentBlock[] => [
        { type: 'text', text: renderCompareText(value as AssetComparison) },
      ],
    },
    async execute(args, exec) {
      const snapshot = await loader.load(exec.signal)
      const a = requireAsset(snapshot, asAssetId(args.asset_id_a))
      const b = requireAsset(snapshot, asAssetId(args.asset_id_b))
      return compareAssets(a, b)
    },
    presentCall(args) {
      return { card: 'generic', title: `compare: ${args.asset_id_a} vs ${args.asset_id_b}`, kind: 'read' }
    },
    presentResult(_args, { content }) {
      return { card: 'generic', title: 'compare_assets', content }
    },
  })
}
