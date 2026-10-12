import { useEffect, useState } from 'react'
import type { Boundaries } from '@/lib/geo'
import type { LoadState } from '@/types'

let cache: Promise<Boundaries> | null = null

function load(): Promise<Boundaries> {
  if (!cache) {
    cache = fetch(`${import.meta.env.BASE_URL}data/boundaries.json`).then((r) => {
      if (!r.ok) throw new Error(`Boundary data failed to load (${r.status})`)
      return r.json() as Promise<Boundaries>
    })
    cache.catch(() => {
      cache = null
    })
  }
  return cache
}

/** Country boundaries (Natural Earth 1:50m via world-atlas), shared across the app. */
export function useBoundaries(): LoadState<Boundaries> & { retry: () => void } {
  const [state, setState] = useState<LoadState<Boundaries>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    setState({ status: 'loading' })
    load().then(
      (data) => live && setState({ status: 'success', data }),
      (error: Error) => live && setState({ status: 'error', error }),
    )
    return () => {
      live = false
    }
  }, [attempt])

  return { ...state, retry: () => setAttempt((n) => n + 1) }
}
