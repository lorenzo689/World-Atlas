import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

type Timer = { callback: () => void; cleared: boolean }

/** Runs public/sw.js in a bare context with a fake network and fake timers. */
function serviceWorker(network: (request: Request, init?: RequestInit) => Promise<Response>) {
  let fetchHandler: (event: unknown) => void = () => { throw new Error('No service worker fetch handler') }
  const cache = new Map<string, Response>()
  const timers: Timer[] = []
  const cached = { match: async (request: Request) => cache.get(request.url)?.clone(), put: async (request: Request, response: Response) => { cache.set(request.url, response.clone()) } }
  runInNewContext(readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8'), {
    URL, Response, AbortController,
    setTimeout: (callback: () => void) => { timers.push({ callback, cleared: false }); return timers.length - 1 },
    clearTimeout: (id: number) => { if (timers[id]) timers[id].cleared = true },
    self: { registration: { scope: 'https://atlas.test/World-Atlas/' }, location: { origin: 'https://atlas.test' }, addEventListener: (type: string, handler: typeof fetchHandler) => { if (type === 'fetch') fetchHandler = handler } },
    caches: { open: async () => cached },
    fetch: network,
  })
  const request = async (path: string) => {
    const pending: Promise<unknown>[] = []
    let response: Promise<Response> | undefined
    fetchHandler({ request: new Request(`https://atlas.test/World-Atlas/${path}`), respondWith: (result: Promise<Response>) => { response = result }, waitUntil: (result: Promise<unknown>) => pending.push(result) })
    const result = await response!
    await Promise.all(pending)
    return result
  }
  /** Lets every timer that was not cleared fire, as if the time limit had passed. */
  const expireTimers = () => timers.filter((timer) => !timer.cleared).forEach((timer) => timer.callback())
  return { cache, request, expireTimers }
}

describe('offline territorial snapshots', () => {
  it('refreshes mutable control data and falls back to its last dated snapshot offline', async () => {
    let offline = false
    let networkCalls = 0
    const worker = serviceWorker(async () => { networkCalls++; if (offline) throw new Error('Offline'); return new Response('{"date":"2026-10-18"}') })
    worker.cache.set('https://atlas.test/World-Atlas/data/territories-today.json', new Response('{"date":"2026-10-01"}'))
    expect(await (await worker.request('data/territories-today.json')).json()).toEqual({ date: '2026-10-18' })
    offline = true
    expect(await (await worker.request('data/territories-today.json')).json()).toEqual({ date: '2026-10-18' })
    expect(networkCalls).toBe(2)
    worker.cache.set('https://atlas.test/World-Atlas/textures/globe.webp', new Response('{"cached":true}'))
    expect(await (await worker.request('textures/globe.webp')).json()).toEqual({ cached: true })
    expect(networkCalls).toBe(2)
  })

  it('does not cut a slow download of the 6 MB history file: the time limit ends with the response headers', async () => {
    let signal: AbortSignal | undefined
    const worker = serviceWorker(async (_request, init) => { signal = init?.signal ?? undefined; return new Response('{"date":"2026-11-17"}') })
    const response = await worker.request('data/territories-history.json')
    worker.expireTimers() // the limit passes while the body is still being read
    expect(signal?.aborted).toBe(false)
    expect(await response.json()).toEqual({ date: '2026-11-17' })
  })

  it('still falls back to the cached copy when the server does not answer within the limit', async () => {
    const worker = serviceWorker((_request, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(new Error('Aborted'))) }))
    worker.cache.set('https://atlas.test/World-Atlas/data/territories-history.json', new Response('{"date":"2026-10-01"}'))
    const pending = worker.request('data/territories-history.json')
    await new Promise((resolve) => setTimeout(resolve, 0))
    worker.expireTimers()
    expect(await (await pending).json()).toEqual({ date: '2026-10-01' })
  })
})
