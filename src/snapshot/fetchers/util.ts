import type { MetricValue, SignalType } from '../types.js'

/** Dependency-injected fetch environment so every adapter is unit-testable offline. */
export interface FetchEnv {
  fetchFn: typeof fetch
  /** Hugging Face API base (https://huggingface.co, or a mirror like https://hf-mirror.com). */
  hfBase: string
  /** ModelScope OpenAPI base (https://modelscope.cn). */
  modelscopeBase: string
  /** Optional GitHub token for higher rate limits (60/h unauthenticated). */
  githubToken?: string
  /** Optional caller cancellation forwarded to every request. */
  signal?: AbortSignal
}

export const deep = (value: number): MetricValue => ({ value, signal_type: 'deep' })
export const shallow = (value: number): MetricValue => ({ value, signal_type: 'shallow' })

export const nowIso = (): string => new Date().toISOString()

/** GET a URL and parse its JSON body. Non-2xx responses throw. */
export async function getJson(env: FetchEnv, url: string): Promise<unknown> {
  const result = await requestJson(env, url)
  return result.data
}

/** GET a URL, returning the parsed body plus headers and status (for Link-header counts). */
export async function requestJson(env: FetchEnv, url: string): Promise<{ data: unknown; headers: Headers; status: number }> {
  const headers: Record<string, string> = { 'User-Agent': 'datatally-fetcher/0.1' }
  if (env.githubToken !== undefined && url.startsWith('https://api.github.com')) {
    headers.Authorization = `Bearer ${env.githubToken}`
  }
  const response = await env.fetchFn(url, { headers, signal: env.signal })
  const text = await response.text()
  let data: unknown = null
  if (text.length > 0) {
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`HTTP ${response.status}: non-JSON response from ${url}`)
    }
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`)
  return { data, headers: response.headers, status: response.status }
}

export const shortName = (id: string): string => {
  const parts = id.split('/')
  return parts[parts.length - 1] ?? id
}

export function inferDomain(tags: unknown): string {
  const list = Array.isArray(tags) ? tags : []
  const joined = list.join(' ').toLowerCase()
  if (/(audio|speech|asr|tts)/.test(joined)) return 'audio'
  if (/(image|vision|object-detection|segmentation)/.test(joined)) return 'vision'
  if (/(text|nlp|language|translation|question-answering|sentiment)/.test(joined)) return 'nlp'
  if (/(tabular|time-series|finance)/.test(joined)) return 'tabular'
  if (/(code|programming)/.test(joined)) return 'code'
  return 'other'
}

export const asSignalType = (value: unknown): SignalType | null =>
  value === 'deep' || value === 'shallow' ? value : null
