import type { WebGLRenderer } from 'three'

/** Enabled with `?debug=1` (or `?perf=1`). Adds an overlay and `window.__perf` for scripted runs. */
export const PERF_DEBUG =
  typeof window !== 'undefined' && /[?&](debug|perf)(=1|=true|&|$)/.test(window.location.search)

export interface PerfSnapshot {
  frames: number
  durationMs: number
  fps: number
  frameP50: number
  frameP95: number
  frameMax: number
  /** CPU time per rendered tick (controls + render submit), all renders incl. on-demand ones. */
  tickP95: number
  tickMax: number
  longTasks: number
  longTaskMs: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
  heapMB: number | null
}

export interface PerfApi {
  ready: boolean
  /** performance.now() when the globe reported ready (≈ time since navigation start). */
  readyAt: number
  snapshot(): PerfSnapshot
  /** Starts a fresh measurement window (frame times, long tasks). */
  reset(): void
}

declare global {
  interface Window {
    __perf?: PerfApi
    /** Current camera pose; only with ?debug=1 (used by scripts/smoke.mjs). */
    __globePose?: () => { lat: number; lng: number; altitude: number }
  }
}

let frameHook: ((chained: boolean, tickMs: number) => void) | null = null

/**
 * Call once per rendered frame. No-op unless the probe is running (?debug=1).
 * `chained`: this frame directly followed the previous one (the loop was already running), so the
 * gap since the last render is a real frame time. Renders that wake an idle loop are not.
 * `tickMs`: CPU time of the whole tick (controls + render submit).
 */
export function perfFrame(chained: boolean, tickMs: number) {
  frameHook?.(chained, tickMs)
}

const percentile = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0

/**
 * Samples frame times via requestAnimationFrame, long tasks via PerformanceObserver and the
 * renderer's own counters. Returns a cleanup function. Only call when PERF_DEBUG is set.
 */
export function startPerfProbe(getRenderer: () => WebGLRenderer | undefined): () => void {
  let frameTimes: number[] = []
  let ticks: number[] = []
  let renders = 0
  const recent: number[] = [] // rolling window for the overlay only; independent of reset()
  let longTasks = 0
  let longTaskMs = 0
  let windowStart = performance.now()
  let last = windowStart

  // The globe renders on demand, so frame times are the gaps between actual renders. Gaps over
  // 250 ms are idle periods, not slow frames: they count as a render but not as a frame time.
  frameHook = (chained, tickMs) => {
    const now = performance.now()
    const dt = now - last
    last = now
    renders++
    ticks.push(tickMs)
    if (chained && dt < 250) {
      frameTimes.push(dt)
      recent.push(dt)
      if (recent.length > 120) recent.shift()
    }
  }

  let observer: PerformanceObserver | undefined
  try {
    observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        longTasks++
        longTaskMs += e.duration
      }
    })
    observer.observe({ entryTypes: ['longtask'] })
  } catch {
    /* longtask not supported */
  }

  const snapshot = (): PerfSnapshot => {
    const info = getRenderer()?.info
    const sorted = [...frameTimes].sort((a, b) => a - b)
    const durationMs = performance.now() - windowStart
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    return {
      frames: renders,
      durationMs,
      fps: durationMs ? (renders / durationMs) * 1000 : 0,
      frameP50: percentile(sorted, 0.5),
      frameP95: percentile(sorted, 0.95),
      frameMax: sorted[sorted.length - 1] ?? 0,
      tickP95: percentile([...ticks].sort((a, b) => a - b), 0.95),
      tickMax: ticks.length ? Math.max(...ticks) : 0,
      longTasks,
      longTaskMs,
      drawCalls: info?.render.calls ?? 0,
      triangles: info?.render.triangles ?? 0,
      geometries: info?.memory.geometries ?? 0,
      textures: info?.memory.textures ?? 0,
      programs: info?.programs?.length ?? 0,
      heapMB: mem ? mem.usedJSHeapSize / 1048576 : null,
    }
  }
  const reset = () => {
    frameTimes = []
    ticks = []
    renders = 0
    longTasks = 0
    longTaskMs = 0
    windowStart = performance.now()
    last = windowStart
  }

  window.__perf = { ready: true, readyAt: performance.now(), snapshot, reset }

  // ---- overlay (updated imperatively, no React involved) ----
  const el = document.createElement('pre')
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:9999;margin:0;padding:6px 8px;border-radius:6px;' +
    'font:11px/1.4 ui-monospace,Consolas,monospace;color:#cfe3ff;background:rgba(8,13,22,.78);pointer-events:none;'
  document.body.appendChild(el)
  const timer = window.setInterval(() => {
    const s = snapshot()
    el.textContent =
      `fps ${s.fps.toFixed(0)}  frame p50 ${s.frameP50.toFixed(1)} / p95 ${s.frameP95.toFixed(1)} ms\n` +
      `draw calls ${s.drawCalls}  tris ${(s.triangles / 1000).toFixed(0)}k\n` +
      `geometries ${s.geometries}  textures ${s.textures}  programs ${s.programs}\n` +
      `long tasks ${s.longTasks} (${s.longTaskMs.toFixed(0)} ms)` +
      (s.heapMB != null ? `  heap ${s.heapMB.toFixed(0)} MB` : '')
  }, 500)

  return () => {
    frameHook = null
    observer?.disconnect()
    window.clearInterval(timer)
    el.remove()
    delete window.__perf
  }
}
