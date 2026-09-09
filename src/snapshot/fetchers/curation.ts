import { readFile } from 'node:fs/promises'

/**
 * Curation map as DATA (DevPlan V0.1.4 P2): replaces the hardcoded GitHub
 * mapping with a configurable, verifiable data file. Each entry carries the
 * dataset identifier, the official portal URL, and an authority annotation
 * stating who/what makes the mapping canonical. Every URL is verifiable by
 * fetch; no entry exists without an authority claim.
 */
export interface CuratedEntry {
  asset_id: string
  /** 'github' entries are fetched as usage signals; other provider kinds are references. */
  provider: string
  url: string
  authority: string
}

export interface CurationFile {
  version: 1
  updated_at: string
  entries: CuratedEntry[]
}

export const CURATION_VERSION = 1

export class CurationFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CurationFileError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CurationFileError(message)
}

/** Validate untrusted curation data into a typed {@link CurationFile}. */
export function validateCuration(value: unknown): CurationFile {
  assert(isRecord(value), 'curation root must be an object')
  assert(value.version === CURATION_VERSION, `curation.version must be ${CURATION_VERSION}`)
  assert(typeof value.updated_at === 'string' && value.updated_at.length > 0, 'curation.updated_at must be a non-empty string')
  const rawEntries = value.entries
  assert(Array.isArray(rawEntries), 'curation.entries must be an array')
  const entries: CuratedEntry[] = []
  for (let index = 0; index < rawEntries.length; index += 1) {
    const entry = rawEntries[index]
    assert(isRecord(entry), `curation.entries[${index}] must be an object`)
    const assetId = entry.asset_id
    assert(typeof assetId === 'string' && assetId.length > 0, `curation.entries[${index}].asset_id must be a non-empty string`)
    const provider = entry.provider
    assert(typeof provider === 'string' && provider.length > 0, `curation.entries[${index}].provider must be a non-empty string`)
    const url = entry.url
    assert(typeof url === 'string' && url.startsWith('https://'), `curation.entries[${index}].url must be an https URL`)
    const authority = entry.authority
    assert(typeof authority === 'string' && authority.length > 0, `curation.entries[${index}].authority must be a non-empty string`)
    const knownKeys = ['asset_id', 'provider', 'url', 'authority']
    for (const key of Object.keys(entry)) {
      assert(knownKeys.includes(key), `curation.entries[${index}] carries unknown field ${JSON.stringify(key)}`)
    }
    entries.push({ asset_id: assetId, provider, url, authority })
  }
  return { version: CURATION_VERSION, updated_at: value.updated_at, entries }
}

/**
 * Load and validate the curation file. Missing or malformed files fail loud —
 * silent omission would hide attribution rules.
 */
export async function loadCurationFile(path: string): Promise<CurationFile> {
  let text: string
  try {
    text = await readFile(path, { encoding: 'utf8' })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new CurationFileError(`datatally: curation file not readable at ${path}: ${detail}`)
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new CurationFileError(`datatally: curation file at ${path} is not valid JSON`)
  }
  return validateCuration(data)
}

/**
 * Extract `owner/repo` from a github.com URL. Returns null for anything else —
 * only exact github.com repository URLs map to usage fetches.
 */
export function githubRepoFromUrl(url: string): string | null {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/|$)/.exec(url)
  if (match === null || match[1] === undefined || match[2] === undefined) return null
  const repo = `${match[1]}/${match[2]}`
  return repo.endsWith('.git') ? repo.slice(0, -4) : repo
}
