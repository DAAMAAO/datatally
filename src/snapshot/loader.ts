import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SNAPSHOT_VERSION, validateSnapshot } from '../schema/snapshot.schema.js'
import type { Snapshot } from './types.js'

/**
 * Self-owned snapshot loader: loads once, validates strictly, fails loud.
 * Contract (EngineeringSpec §6):
 * - unknown version = load failure with a migration pointer;
 * - corrupted JSON / malformed shape = load failure, never silent empty data;
 * - missing file at the configured path = load failure (loud);
 * - honors `signal` for large snapshots;
 * - missing provenance is marked downstream, never silently omitted.
 */
export class SnapshotLoader {
  private cache: Snapshot | undefined

  constructor(public readonly path: string) {}

  async load(signal?: AbortSignal): Promise<Snapshot> {
    if (this.cache !== undefined) return this.cache
    let text: string
    try {
      text = await readFile(this.path, { encoding: 'utf8', signal })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`datatally: snapshot file not readable at ${this.path}: ${detail}`)
    }
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`datatally: snapshot at ${this.path} is not valid JSON`)
    }
    const snapshot = validateSnapshot(data)
    if (snapshot.version !== SNAPSHOT_VERSION) {
      throw new Error(
        `datatally: unsupported snapshot version ${JSON.stringify(snapshot.version)} (expected "${SNAPSHOT_VERSION}"); v1 snapshots require migration — regenerate the snapshot with the version-2 fetcher`,
      )
    }
    this.cache = snapshot
    return snapshot
  }

  /** Drop the cache; the next `load()` re-reads and re-validates the file. */
  dispose(): void {
    this.cache = undefined
  }
}

/**
 * Package root, for the bundled-seed fallback: a relative `snapshotPath`
 * resolves against the process cwd first (the user's own snapshot wins);
 * when no file exists there, it falls back to the snapshot shipped inside
 * this package. A file missing at BOTH locations fails loud at `load()`.
 */
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

export function createSnapshotLoader(snapshotPath: string): SnapshotLoader {
  const fromCwd = resolve(snapshotPath)
  const resolvedPath = existsSync(fromCwd) ? fromCwd : resolve(PACKAGE_ROOT, snapshotPath)
  return new SnapshotLoader(resolvedPath)
}
