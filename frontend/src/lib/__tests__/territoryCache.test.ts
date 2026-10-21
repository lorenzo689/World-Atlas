import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

describe('offline territorial snapshots', () => {
  it('refreshes mutable control data and falls back to its last dated snapshot offline', async () => {
    let fetchHandler: (event: unknown) => void = () => { throw new Error('No service worker fetch handler') }
    const cache = new Map<string, Response>()
    let offline = false
    let networkCalls = 0
    const cached = { match: async (request: Request) => cache.get(request.url)?.clone(), put: async (request: Request, response: Response) => { cache.set(request.url, response.clone()) } }
    runInNewContext(readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8'), {
      URL, Response, AbortSignal,
      self: { registration: { scope: 'https://atlas.test/World-Atlas/' }, location: { origin: 'https://atlas.test' }, addEventListener: (type: string, handler: typeof fetchHandler) => { if (type === 'fetch') fetchHandler = handler } },
      caches: { open: async () => cached },
      fetch: async () => { networkCalls++; if (offline) throw new Error('Offline'); return new Response('{"date":"2026-10-18"}') },
    })
    const request = async (path: string) => {
      const pending: Promise<unknown>[] = []
      let response: Promise<Response> | undefined
      fetchHandler({ request: new Request(`https://atlas.test/World-Atlas/${path}`), respondWith: (result: Promise<Response>) => { response = result }, waitUntil: (result: Promise<unknown>) => pending.push(result) })
      const result = await response!
      await Promise.all(pending)
      return result.json()
    }
    cache.set('https://atlas.test/World-Atlas/data/territories-today.json', new Response('{"date":"2026-10-01"}'))
    expect(await request('data/territories-today.json')).toEqual({ date: '2026-10-18' })
    offline = true
    expect(await request('data/territories-today.json')).toEqual({ date: '2026-10-18' })
    expect(networkCalls).toBe(2)
    cache.set('https://atlas.test/World-Atlas/textures/globe.webp', new Response('{"cached":true}'))
    expect(await request('textures/globe.webp')).toEqual({ cached: true })
    expect(networkCalls).toBe(2)
  })
})
