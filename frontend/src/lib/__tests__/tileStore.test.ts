import { describe, expect, it, vi } from 'vitest'
import { TileStore } from '@/lib/tileStore'

const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

describe('TileStore', () => {
  it('loads nearest tiles first, cancels stale work and disposes a late result', async () => {
    const pending = new Map<string, (value: string) => void>()
    const load = vi.fn((key: string, _signal: AbortSignal) => new Promise<string>((resolve) => pending.set(key, resolve)))
    const dispose = vi.fn()
    const loaded = vi.fn()
    const store = new TileStore({ maxCache: 2, maxRequests: 2, load, dispose, onLoaded: loaded })

    store.setWanted(['near', 'middle', 'far'])
    expect(load.mock.calls.map(([key]) => key)).toEqual(['near', 'middle'])
    store.setWanted(['far'])
    expect(load.mock.calls[0][1].aborted).toBe(true)
    pending.get('near')!('stale')
    await flush()
    expect(dispose).toHaveBeenCalledWith('stale')
    expect(load.mock.calls.map(([key]) => key)).toEqual(['near', 'middle', 'far'])
    pending.get('far')!('visible')
    await flush()
    expect(store.get('far')).toBe('visible')
    expect(loaded).toHaveBeenCalledWith('far', 'visible')
    pending.get('middle')!('old')
    await flush()
    store.dispose()
    expect(dispose).toHaveBeenCalledWith('visible')
  })

  it('keeps visible resources and evicts the oldest unused resource', async () => {
    const dispose = vi.fn()
    const load = vi.fn(async (key: string) => key)
    const store = new TileStore({ maxCache: 2, maxRequests: 2, load, dispose, onLoaded: vi.fn() })
    store.setWanted(['a', 'b'])
    await flush()
    store.setWanted(['b', 'c'])
    await flush()
    expect(store.has('a')).toBe(false)
    expect(store.has('b')).toBe(true)
    expect(store.has('c')).toBe(true)
    expect(dispose).toHaveBeenCalledWith('a')
    store.setWanted(['b'])
    await flush()
    expect(load.mock.calls.filter(([key]) => key === 'b')).toHaveLength(1)
    store.dispose()
  })

  it('retries a transient failure only after the backoff', async () => {
    let now = 100
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
    try {
      const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('ok')
      const store = new TileStore({ maxCache: 1, maxRequests: 1, retryDelayMs: 500, load, dispose: vi.fn(), onLoaded: vi.fn() })
      store.setWanted(['a'])
      await flush()
      now = 300
      store.setWanted(['a'])
      expect(load).toHaveBeenCalledTimes(1)
      now = 601
      store.setWanted(['a'])
      await flush()
      expect(load).toHaveBeenCalledTimes(2)
      expect(store.get('a')).toBe('ok')
      store.dispose()
    } finally {
      clock.mockRestore()
    }
  })
})
