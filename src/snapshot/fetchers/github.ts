import type { SourceMetrics } from '../types.js'
import { deep, nowIso, requestJson, shallow } from './util.js'
import type { FetchEnv } from './util.js'

/**
 * GitHub usage signals for a curated dataset→repository mapping.
 * stars: interest only (shallow); forks and commits: actual use (deep).
 * The commit count reads the `Link` header of a per_page=1 listing; when no
 * Link header exists the count is the (≤1) returned entries.
 */
export async function fetchGithub(env: FetchEnv, repo: string): Promise<SourceMetrics | null> {
  try {
    const result = await requestJson(env, `https://api.github.com/repos/${repo}`)
    const meta = result.data
    if (meta === null || typeof meta !== 'object') return null
    const record = meta as Record<string, unknown>
    if (typeof record.stargazers_count !== 'number') return null
    const metrics: Record<string, { value: number; signal_type: 'deep' | 'shallow' }> = {
      stars: shallow(record.stargazers_count),
    }
    if (typeof record.forks_count === 'number') metrics.forks = deep(record.forks_count)
    const commits = await fetchCommitCount(env, repo)
    if (commits !== null) metrics.commits = deep(commits)
    return { source: 'github', metrics, fetched_at: nowIso() }
  } catch {
    return null
  }
}

async function fetchCommitCount(env: FetchEnv, repo: string): Promise<number | null> {
  const result = await requestJson(env, `https://api.github.com/repos/${repo}/commits?per_page=1`)
  if (!Array.isArray(result.data)) return null
  const link = result.headers.get('link')
  if (link !== null) {
    const last = /<[^>]*[?&]page=(\d+)>;\s*rel="last"/.exec(link)
    if (last !== null && last[1] !== undefined) {
      const count = Number(last[1])
      if (Number.isFinite(count)) return count
    }
  }
  return result.data.length
}
