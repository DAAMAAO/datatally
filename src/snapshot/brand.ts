import type { Branded } from '@deepseek-ai/dsh-brand'

/**
 * Opaque data-asset id. Model input arrives as `string` at the tool schema
 * boundary; the loader casts to `AssetId` for the internal query layer.
 * Bare strings never cross the internal boundary.
 */
export type AssetId = Branded<'datatally.AssetId'>

/** Tool-boundary cast from validated model input. */
export const asAssetId = (value: string): AssetId => value as AssetId
