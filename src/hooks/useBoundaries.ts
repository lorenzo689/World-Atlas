import { useEffect, useState } from 'react'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import type { FeatureCollection, Geometry } from 'geojson'
import type { Boundaries, CountryProps } from '@/lib/geo'
import type { PrecomputedGeometry } from '@/lib/globeLayers'
import type { LoadState } from '@/types'

let cache: Promise<Boundaries> | null = null

async function fetchGeometry(base: string): Promise<PrecomputedGeometry | null> {
  try {
    const [meta, bin] = await Promise.all([
      fetch(`${base}data/geometry.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('meta')))),
      fetch(`${base}data/geometry.bin`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('bin')))),
    ])
    const { vertices, indices, ranges } = meta as {
      vertices: number
      indices: number
      ranges: PrecomputedGeometry['ranges']
    }
    return {
      lnglat: new Float32Array(bin, 0, vertices * 2),
      indices: new Uint32Array(bin, vertices * 2 * 4, indices),
      ranges,
    }
  } catch {
    return null // falls back to in-browser tessellation
  }
}

function load(): Promise<Boundaries> {
  if (!cache) {
    const base = import.meta.env.BASE_URL
    const geometry = fetchGeometry(base)
    cache = fetch(`${base}data/boundaries.json`).then(async (r) => {
      if (!r.ok) throw new Error(`Boundary data failed to load (${r.status})`)
      const topology = (await r.json()) as Topology
      const countries = topology.objects.countries as GeometryCollection<CountryProps>
      const fc = feature(topology, countries) as FeatureCollection<Geometry, CountryProps>
      return { ...fc, borders: mesh(topology, countries).coordinates, geometry: await geometry } as Boundaries
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
