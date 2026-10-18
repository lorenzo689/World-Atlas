/** Shared lifecycle for camera-local resources: priority queue, cancellation and bounded LRU cache. */
export class TileStore<T> {
  private cache = new Map<string, { value: T; used: number }>()
  private wanted = new Set<string>()
  private queue: string[] = []
  private loading = new Map<string, AbortController>()
  private failedUntil = new Map<string, number>()
  private disposed = false

  constructor(private options: {
    maxCache: number
    maxRequests: number
    retryDelayMs?: number
    load: (key: string, signal: AbortSignal) => Promise<T>
    dispose: (value: T) => void
    onLoaded: (key: string, value: T) => void
  }) {}

  get(key: string): T | undefined { return this.cache.get(key)?.value }
  has(key: string): boolean { return this.cache.has(key) }
  *entries(): IterableIterator<[string, T]> {
    for (const [key, entry] of this.cache) yield [key, entry.value]
  }
  wantedKeys(): ReadonlySet<string> { return this.wanted }

  /** Keys arrive nearest-first, so the queue fetches visible centre tiles before the periphery. */
  setWanted(keys: Iterable<string>, now = performance.now()) {
    if (this.disposed) return
    this.wanted = new Set(keys)
    for (const [key, controller] of this.loading) if (!this.wanted.has(key)) controller.abort()
    for (const [key, entry] of this.cache) if (this.wanted.has(key)) entry.used = now
    this.queue = [...this.wanted].filter((key) => !this.cache.has(key) && !this.loading.has(key)
      && (this.failedUntil.get(key) ?? 0) <= now)
    this.trim()
    this.pump()
  }

  private pump() {
    while (!this.disposed && this.loading.size < this.options.maxRequests && this.queue.length) {
      const key = this.queue.shift()!
      if (!this.wanted.has(key) || this.cache.has(key) || this.loading.has(key)) continue
      const controller = new AbortController()
      this.loading.set(key, controller)
      this.options.load(key, controller.signal).then((value) => {
        if (this.disposed || controller.signal.aborted || !this.wanted.has(key)) {
          this.options.dispose(value)
          return
        }
        this.failedUntil.delete(key)
        this.cache.set(key, { value, used: performance.now() })
        this.options.onLoaded(key, value)
        this.trim()
      }).catch(() => {
        if (!controller.signal.aborted && !this.disposed) {
          this.failedUntil.set(key, performance.now() + (this.options.retryDelayMs ?? 15_000))
        }
      }).finally(() => {
        this.loading.delete(key)
        if (!this.disposed && this.wanted.has(key) && !this.cache.has(key)
          && (this.failedUntil.get(key) ?? 0) <= performance.now() && !this.queue.includes(key)) {
          this.queue.unshift(key)
        }
        this.pump()
      })
    }
  }

  private trim() {
    const extra = this.cache.size - this.options.maxCache
    if (extra <= 0) return
    const stale = [...this.cache].filter(([key]) => !this.wanted.has(key))
      .sort((a, b) => a[1].used - b[1].used)
    for (const [key, entry] of stale.slice(0, extra)) {
      this.options.dispose(entry.value)
      this.cache.delete(key)
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    for (const controller of this.loading.values()) controller.abort()
    for (const entry of this.cache.values()) this.options.dispose(entry.value)
    this.cache.clear()
    this.wanted.clear()
    this.queue.length = 0
  }
}
