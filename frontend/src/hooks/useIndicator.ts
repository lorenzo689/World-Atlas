import { useEffect, useState } from 'react'
import type { IndicatorSeries, LoadState } from '@/types'
import { INDICATORS, type IndicatorKey } from '@/lib/indicators'
import { dataApi } from '@/lib/backend'
import { fetchLatestForAll, fetchSeries, type LatestValue } from '@/lib/worldbank'

type WithRetry<T> = LoadState<T> & { retry: () => void }

/** Full time series of one World Bank indicator for one country. */
export function useIndicator(countryCode: string | undefined, key: IndicatorKey): WithRetry<IndicatorSeries> {
  const [state, setState] = useState<LoadState<IndicatorSeries>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!countryCode) return
    let live = true
    setState({ status: 'loading' })
    fetchSeries(countryCode, INDICATORS[key].id).then(
      (data) => live && setState({ status: 'success', data }),
      (error: Error) => live && setState({ status: 'error', error }),
    )
    return () => {
      live = false
    }
  }, [countryCode, key, attempt])

  return { ...state, retry: () => setAttempt((n) => n + 1) }
}

/** Latest value per country for one indicator (used for the Data globe mode and the preview panel). */
export function useLatestForAll(key: IndicatorKey, enabled = true): WithRetry<Map<string, LatestValue>> {
  const [state, setState] = useState<LoadState<Map<string, LatestValue>>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let live = true
    setState({ status: 'loading' })
    fetchLatestForAll(INDICATORS[key].id).then(
      (data) => live && setState({ status: 'success', data }),
      (error: Error) => live && setState({ status: 'error', error }),
    )
    return () => {
      live = false
    }
  }, [key, enabled, attempt])

  return { ...state, retry: () => setAttempt((n) => n + 1) }
}

export type SeriesMap = Partial<Record<IndicatorKey, IndicatorSeries>>

/** Several indicators for one country at once. Succeeds when at least one indicator loads. */
export function useIndicators(
  countryCode: string | undefined,
  keys: readonly IndicatorKey[],
): WithRetry<SeriesMap> {
  const [state, setState] = useState<LoadState<SeriesMap>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const keyList = keys.join(',')

  useEffect(() => {
    if (!countryCode) return
    let live = true
    setState({ status: 'loading' })
    Promise.allSettled(keyList.split(',').map((k) => fetchSeries(countryCode, INDICATORS[k as IndicatorKey].id))).then((res) => {
      if (!live) return
      const out: SeriesMap = {}
      const ks = keyList.split(',') as IndicatorKey[]
      res.forEach((r, i) => {
        if (r.status === 'fulfilled') out[ks[i]] = r.value
      })
      if (Object.keys(out).length === 0) {
        const firstErr = res.find((r): r is PromiseRejectedResult => r.status === 'rejected')
        setState({ status: 'error', error: firstErr?.reason instanceof Error ? firstErr.reason : new Error('Failed to load') })
      } else setState({ status: 'success', data: out })
    })
    return () => {
      live = false
    }
  }, [countryCode, keyList, attempt])

  return { ...state, retry: () => setAttempt((n) => n + 1) }
}

const atYearCache = new Map<string, Promise<Map<string, LatestValue>>>()

/**
 * Every country's value for one year, from the Spring Boot data platform (PostgreSQL, cached in Redis).
 * Pass `year = null` to skip the request. Used by the time slider in data mode.
 */
export function useIndicatorAtYear(key: IndicatorKey, year: number | null): LoadState<Map<string, LatestValue>> {
  const [state, setState] = useState<LoadState<Map<string, LatestValue>>>({ status: 'loading' })

  useEffect(() => {
    if (year == null) return
    let live = true
    setState({ status: 'loading' })
    const cacheKey = `${key}:${year}`
    let promise = atYearCache.get(cacheKey)
    if (!promise) {
      promise = dataApi.atYear(key, year).then((r) => {
        const out = new Map<string, LatestValue>()
        for (const [code, p] of Object.entries(r.values)) out.set(code, { year: p.year, value: p.value })
        return out
      })
      promise.catch(() => atYearCache.delete(cacheKey))
      atYearCache.set(cacheKey, promise)
    }
    promise.then(
      (data) => live && setState({ status: 'success', data }),
      (error: Error) => live && setState({ status: 'error', error }),
    )
    return () => {
      live = false
    }
  }, [key, year])

  return state
}
