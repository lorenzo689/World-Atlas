import { useAuth, type AuthResponse } from '@/store/auth'

/** An error response from the backend (RFC 9457 problem detail). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message)
  }
}

let refreshing: Promise<boolean> | null = null

/** Exchanges the refresh token for new tokens. Concurrent callers share one request ("single flight"). */
async function refreshSession(): Promise<boolean> {
  const { refreshToken, setSession, clear } = useAuth.getState()
  if (!refreshToken) return false
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (r) => {
        if (!r.ok) {
          clear()
          return false
        }
        setSession((await r.json()) as AuthResponse)
        return true
      })
      .catch(() => false)
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

/** A valid access token, refreshed shortly before it expires. */
export async function accessToken(): Promise<string | null> {
  const { accessToken: token, expiresAt } = useAuth.getState()
  if (token && Date.now() < expiresAt - 30_000) return token
  if (await refreshSession()) return useAuth.getState().accessToken
  return null
}

interface RequestOptions {
  method?: string
  body?: unknown
  signal?: AbortSignal
  /** send the bearer token if there is one (default true) */
  auth?: boolean
}

/**
 * Typed fetch for the backend API (`/api/...`, proxied by Vite).
 * Adds the bearer token, retries once after a 401 with a refreshed token,
 * and turns problem-detail responses into {@link ApiError}s.
 */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const send = async (token: string | null) =>
    fetch(`/api${path}`, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    })

  const useAuthHeader = opts.auth !== false
  let res = await send(useAuthHeader ? await accessToken() : null)
  if (res.status === 401 && useAuthHeader && (await refreshSession())) {
    res = await send(useAuth.getState().accessToken)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  const data = text ? JSON.parse(text) : undefined
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.code ?? 'http_' + res.status,
      data?.detail ?? `Request failed (${res.status})`,
      data?.fields ?? {},
    )
  }
  return data as T
}

/** Fetches a binary resource with auth (e.g. a quiz flag) and returns an object URL. */
export async function apiBlobUrl(path: string): Promise<string> {
  const token = await accessToken()
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new ApiError(res.status, 'http_' + res.status, 'Could not load image')
  return URL.createObjectURL(await res.blob())
}

let available: Promise<boolean> | null = null
let checkedAt = 0

/**
 * Whether the Spring Boot backend is reachable. The globe and country pages work without it
 * (falling back to the World Bank API); games, atlas and the data platform need it.
 * A positive answer is cached for the session, a negative one is re-checked after 10 s.
 */
export function backendAvailable(): Promise<boolean> {
  if (available && checkedAt > Date.now() - 10_000) return available
  if (available) {
    const cached = available
    // keep a known-good result, retry a known-bad one
    available = cached.then((ok) => (ok ? true : probe()))
  } else {
    available = probe()
  }
  checkedAt = Date.now()
  return available
}

async function probe(): Promise<boolean> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 5000)
  try {
    const r = await fetch('/api/health', { signal: ctrl.signal })
    return r.ok && (r.headers.get('content-type') ?? '').includes('json')
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

// ---- auth calls ------------------------------------------------------------------------------
export const authApi = {
  login: (email: string, password: string) =>
    api<AuthResponse>('/auth/login', { body: { email, password }, auth: false }),
  register: (email: string, password: string, displayName: string) =>
    api<AuthResponse>('/auth/register', { body: { email, password, displayName }, auth: false }),
  guest: (displayName: string) => api<AuthResponse>('/auth/guest', { body: { displayName }, auth: false }),
  logout: async () => {
    const { refreshToken, clear } = useAuth.getState()
    if (refreshToken) await api('/auth/logout', { body: { refreshToken }, auth: false }).catch(() => {})
    clear()
  },
}
