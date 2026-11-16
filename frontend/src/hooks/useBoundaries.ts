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
    return null // caller falls back to in-browser tessellation
  }
}

async function tessellateFallback(features: Boundaries['features']): Promise<PrecomputedGeometry> {
  // Loaded only when geometry.bin is unavailable; keeps the tessellator out of the globe bundle.
  const { tessellateCountries } = await import('@/lib/tessellate')
  return tessellateCountries(features)
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
      const features = fc.features as Boundaries['features']
      const precomputed = (await geometry) ?? (await tessellateFallback(features))
      return { ...fc, borders: mesh(topology, countries).coordinates, geometry: precomputed } as Boundaries
    })
    cache.catch(() => {
      cache = null
    })
  }
  return cache
}

/** Start loading the boundary + geometry files without waiting for a component to ask. */
export function prefetchBoundaries() {
  load().catch(() => {})
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
