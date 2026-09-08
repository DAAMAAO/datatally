import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { createSnapshotLoader } from './snapshot/loader.js'
import { registerCompareTool } from './tools/compare.js'
import { registerProfileTool } from './tools/profile.js'
import { registerSearchTool } from './tools/search.js'

export const name = 'datatally'

export const inject = ['tools']

export interface Config {
  snapshotPath: string
  maxResults: number
  enableCitationFields: boolean
}

export const Config: Schema<Config> = Schema.object({
  snapshotPath: Schema.string().default('./data/snapshot_v2.json'),
  maxResults: Schema.number().default(20),
  enableCitationFields: Schema.boolean().default(true),
})

export function apply(ctx: Context, config: Config) {
  const loader = createSnapshotLoader(config.snapshotPath)
  ctx.effect(() => () => loader.dispose(), 'datatally snapshot loader')

  ctx.tools.register(registerSearchTool(loader, { maxResults: config.maxResults }))
  ctx.tools.register(registerProfileTool(loader, { enableCitationFields: config.enableCitationFields }))
  ctx.tools.register(registerCompareTool(loader))
}
