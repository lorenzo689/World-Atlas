import { useAuth, type AuthResponse } from '@/store/auth'
import { t, useLang, type MessageKey } from '@/i18n'

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

/** Uses a translated message for known error codes (e.g. `error.email_taken`), else the server's text. */
function localized(code: string, fallback: string) {
  const key = `error.${code}` as MessageKey
  const text = t(key)
  return text === key ? fallback : text
}

let refreshing: Promise<boolean> | null = null

/**
 * Exchanges the refresh-token cookie for a new access token. Concurrent callers share one request
 * ("single flight"), so ten parallel 401s cause exactly one refresh.
 */
async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) {
          useAuth.getState().clear()
          return false
        }
        useAuth.getState().setSession((await r.json()) as AuthResponse)
        return true
      })
      .catch(() => false)
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

/** On startup: turn the cookie back into a session (if the user was signed in before). */
export async function restoreSession() {
  const { user, setRestored } = useAuth.getState()
  if (user) await refreshSession()
  setRestored()
}

/** A valid access token, refreshed shortly before it expires. */
export async function accessToken(): Promise<string | null> {
  const { accessToken: token, expiresAt, user } = useAuth.getState()
  if (token && Date.now() < expiresAt - 30_000) return token
  if (!user) return null
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
 * Typed fetch for the backend API (`/api/...`, proxied by Vite / the reverse proxy).
 * Adds the bearer token and the UI language, retries once after a 401 with a refreshed token,
 * and turns problem-detail responses into {@link ApiError}s.
 */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const send = async (token: string | null) =>
    fetch(`/api${path}`, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      credentials: 'same-origin',
      headers: {
        'Accept-Language': useLang.getState().lang,
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    })

  const useAuthHeader = opts.auth !== false
  let res: Response
  try {
    res = await send(useAuthHeader ? await accessToken() : null)
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new ApiError(0, 'network', t('error.network'))
  }
  if (res.status === 401 && useAuthHeader && useAuth.getState().user && (await refreshSession())) {
    res = await send(useAuth.getState().accessToken)
  }
  if (res.status === 204 || res.status === 202) return undefined as T
  const text = await res.text()
  let data: Record<string, unknown> | undefined
  try {
    data = text ? JSON.parse(text) : undefined
  } catch {
    data = undefined
  }
  if (!res.ok) {
    const code = (data?.code as string) ?? 'http_' + res.status
    throw new ApiError(res.status, code, localized(code, (data?.detail as string) ?? `Request failed (${res.status})`),
      (data?.fields as Record<string, string>) ?? {})
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
    available = cached.then((ok) => (ok ? true : probe()))
  } else {
    available = probe()
  }
  checkedAt = Date.now()
  return available
}

async function probe(): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5000)
  try {
    const r = await fetch('/api/health', { signal: ctrl.signal })
    return r.ok && (r.headers.get('content-type') ?? '').includes('json')
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// ---- auth calls ------------------------------------------------------------------------------
const session = async (p: Promise<AuthResponse>) => {
  const res = await p
  useAuth.getState().setSession(res)
  return res
}

export const authApi = {
  login: (email: string, password: string) =>
    session(api<AuthResponse>('/auth/login', { body: { email, password }, auth: false })),
  register: (email: string, password: string, displayName: string) =>
    session(api<AuthResponse>('/auth/register', { body: { email, password, displayName }, auth: false })),
  guest: (displayName: string) => session(api<AuthResponse>('/auth/guest', { body: { displayName }, auth: false })),
  verify: (token: string) => session(api<AuthResponse>('/auth/verify', { body: { token }, auth: false })),
  resendVerification: () => api<void>('/auth/verify/resend', { method: 'POST' }),
  forgotPassword: (email: string) => api<void>('/auth/forgot-password', { body: { email }, auth: false }),
  resetPassword: (token: string, password: string) =>
    session(api<AuthResponse>('/auth/reset-password', { body: { token, password }, auth: false })),
  logout: async () => {
    await api('/auth/logout', { method: 'POST', auth: false }).catch(() => {})
    useAuth.getState().clear()
  },
}
