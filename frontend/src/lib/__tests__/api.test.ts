import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, authApi } from '@/lib/api'
import { useAuth } from '@/store/auth'
import { useLang } from '@/i18n'

const user = { id: 'u1', displayName: 'Ada', email: 'ada@example.com', roles: ['USER'], guest: false, emailVerified: true }
const session = (token: string) => ({ accessToken: token, expiresIn: 900, user })
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    useAuth.getState().clear()
    useLang.setState({ lang: 'en' })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends bearer token and language', async () => {
    useAuth.getState().setSession(session('tok-1'))
    fetchMock.mockResolvedValueOnce(json({ ok: true }))
    await api('/ping')
    const init = fetchMock.mock.calls[0][1]!
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1')
    expect((init.headers as Record<string, string>)['Accept-Language']).toBe('en')
  })

  it('refreshes the session once after a 401 and retries', async () => {
    useAuth.getState().setSession(session('old'))
    fetchMock
      .mockResolvedValueOnce(json({ code: 'unauthorized' }, 401))
      .mockResolvedValueOnce(json(session('new'))) // POST /auth/refresh (cookie)
      .mockResolvedValueOnce(json({ ok: 1 }))
    await expect(api('/me')).resolves.toEqual({ ok: 1 })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/refresh')
    expect((fetchMock.mock.calls[2][1]!.headers as Record<string, string>).Authorization).toBe('Bearer new')
  })

  it('translates known error codes and exposes field errors', async () => {
    useLang.setState({ lang: 'de' })
    fetchMock.mockResolvedValueOnce(json({ code: 'email_taken', detail: 'taken', fields: { email: 'x' } }, 409))
    const err = (await api('/auth/register', { body: {}, auth: false }).catch((e: unknown) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.message).toBe('Mit dieser E-Mail existiert bereits ein Konto.')
    expect(err.fields).toEqual({ email: 'x' })
  })

  it('reports network failures in the UI language', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    const err = (await api('/x', { auth: false }).catch((e: unknown) => e)) as ApiError
    expect(err.code).toBe('network')
    expect(err.message).toMatch(/server/i)
  })

  it('keeps the access token in memory only', async () => {
    fetchMock.mockResolvedValueOnce(json(session('secret-token')))
    await authApi.login('ada@example.com', 'pw-12345678')
    expect(useAuth.getState().accessToken).toBe('secret-token')
    const stored = localStorage.getItem('world-explorer-auth') ?? ''
    expect(stored).not.toContain('secret-token')
    expect(stored).toContain('Ada')
  })
})
