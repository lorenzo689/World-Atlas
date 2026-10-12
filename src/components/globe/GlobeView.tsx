import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import { MeshPhongMaterial, TextureLoader, Color, type PerspectiveCamera } from 'three'
import type { Country, GlobeMode } from '@/types'
import type { Boundaries, CountryFeature, Pose } from '@/lib/geo'
import { poseForFeature, poseForPoint } from '@/lib/geo'
import { buildChoropleth, hash01, mix, NO_DATA_COLOR, REGION_COLORS } from '@/lib/color'
import type { IndicatorMeta } from '@/lib/indicators'
import type { LatestValue } from '@/lib/worldbank'
import { usePrefersReducedMotion } from '@/hooks/useMisc'

const BASE = import.meta.env.BASE_URL
const TEX = {
  day: `${BASE}textures/earth-blue-marble.jpg`,
  bump: `${BASE}textures/earth-topology.png`,
  water: `${BASE}textures/earth-water.png`,
  sky: `${BASE}textures/night-sky.png`,
}
const OCEAN = '#0b1626'
const DEFAULT_POSE: Pose = { lat: 22, lng: 12, altitude: 2.3 }

export interface GlobeInsets {
  right: number
  bottom: number
}

interface GlobeViewProps {
  boundaries: Boundaries
  countries: Map<string, Country>
  mode: GlobeMode
  values: Map<string, LatestValue> | null
  metric: IndicatorMeta
  selected: string | null
  onSelect: (code: string) => void
  onReady: () => void
  onPoseChange: (pose: Pose) => void
  initialPose: Pose | null
  insets: GlobeInsets
  /** Increment to re-fly to the current selection even if it did not change. */
  focusNonce?: number
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export function GlobeView({
  boundaries,
  countries,
  mode,
  values,
  metric,
  selected,
  onSelect,
  onReady,
  onPoseChange,
  initialPose,
  insets,
  focusNonce = 0,
}: GlobeViewProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [hovered, setHovered] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const reduced = usePrefersReducedMotion()

  const features = boundaries.features as CountryFeature[]
  const featureByCode = useMemo(() => new Map(features.map((f) => [f.properties.code, f])), [features])

  // ---- sizing ------------------------------------------------------------------------------
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width && height) setSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ---- choropleth --------------------------------------------------------------------------
  const choropleth = useMemo(() => {
    if (!values) return null
    const nums: number[] = []
    for (const f of features) {
      const v = values.get(f.properties.code)
      if (v) nums.push(v.value)
    }
    return buildChoropleth(nums)
  }, [values, features])

  // ---- accessors ---------------------------------------------------------------------------
  const capColor = useCallback(
    (d: object) => {
      const code = (d as CountryFeature).properties.code
      const isSel = code === selected
      const isHover = code === hovered
      if (mode === 'satellite') {
        if (isSel) return 'rgba(111,168,255,0.36)'
        if (isHover) return 'rgba(111,168,255,0.26)'
        return 'rgba(255,255,255,0.012)'
      }
      let base: string
      if (mode === 'political') {
        const c = countries.get(code)
        const region = REGION_COLORS[c?.region ?? ''] ?? '#6d7a8c'
        // Slight per-country variation so neighbours in the same region stay distinguishable.
        base = mix(region, hash01(code) > 0.5 ? '#ffffff' : '#000000', 0.04 + hash01(code + 'x') * 0.14)
      } else {
        const v = values?.get(code)
        base = v && choropleth ? choropleth.color(v.value) : NO_DATA_COLOR
      }
      if (isSel) return mix(base, '#ffffff', 0.38)
      if (isHover) return mix(base, '#ffffff', 0.22)
      return base
    },
    [mode, selected, hovered, countries, values, choropleth],
  )

  const strokeColor = useCallback(
    (d: object) => {
      const code = (d as CountryFeature).properties.code
      if (code === selected) return 'rgba(214,232,255,0.95)'
      if (code === hovered) return 'rgba(190,215,255,0.85)'
      return mode === 'satellite' ? 'rgba(255,255,255,0.26)' : 'rgba(8,13,22,0.75)'
    },
    [mode, selected, hovered],
  )

  const altitude = useCallback(
    (d: object) => {
      const code = (d as CountryFeature).properties.code
      if (code === selected) return 0.022
      if (code === hovered) return 0.014
      return mode === 'satellite' ? 0.002 : 0.004
    },
    [mode, selected, hovered],
  )

  const sideColor = useCallback(
    (d: object) => {
      const code = (d as CountryFeature).properties.code
      return code === selected || code === hovered ? 'rgba(111,168,255,0.28)' : 'rgba(0,0,0,0)'
    },
    [selected, hovered],
  )

  const label = useCallback(
    (d: object) => {
      const code = (d as CountryFeature).properties.code
      const c = countries.get(code)
      if (!c) return ''
      let sub = [c.capital[0], c.subregion ?? c.region].filter(Boolean).join(' · ')
      if (mode === 'data') {
        const v = values?.get(code)
        sub = v ? `${metric.format(v.value)} · ${v.year}` : 'No data reported'
      }
      return `<div class="globe-tip"><img src="${BASE}flags/${esc(code)}.svg" alt="" /><div>${esc(c.name)}<small>${esc(sub)}</small></div></div>`
    },
    [countries, mode, values, metric],
  )

  // ---- ready: renderer tweaks, lights, initial camera ----------------------------------------
  const handleReady = useCallback(() => {
    const g = globeRef.current
    if (!g) return
    g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    const controls = g.controls()
    controls.autoRotateSpeed = 0.35
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 108
    controls.maxDistance = 520
    const start = initialPose ?? DEFAULT_POSE
    if (initialPose || reduced) {
      g.pointOfView(start, 0)
    } else {
      g.pointOfView({ ...start, altitude: 5.5 }, 0)
      g.pointOfView(start, 2600)
    }
    setReady(true)
    onReady()
  }, [initialPose, onReady, reduced])

  // ---- surface material per mode -------------------------------------------------------------
  // Satellite gets specular ocean glints; the other modes use a flat, dark ocean.
  const satellite = mode === 'satellite'
  const globeMaterial = useMemo(() => {
    const m = new MeshPhongMaterial()
    if (satellite) {
      m.specularMap = new TextureLoader().load(TEX.water)
      m.specular = new Color('#35527a')
      m.shininess = 14
    } else {
      m.color = new Color(OCEAN)
      m.specular = new Color('#0d1b2e')
      m.shininess = 4
    }
    return m
  }, [satellite])

  // ---- auto-rotate while idle ----------------------------------------------------------------
  useEffect(() => {
    const g = globeRef.current
    if (!g || !ready) return
    const controls = g.controls()
    let timer: number | undefined
    const resume = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        controls.autoRotate = !reduced && !selected
      }, 5000)
    }
    const stop = () => {
      controls.autoRotate = false
      window.clearTimeout(timer)
    }
    controls.autoRotate = !reduced && !selected
    controls.addEventListener('start', stop)
    controls.addEventListener('end', resume)
    return () => {
      controls.removeEventListener('start', stop)
      controls.removeEventListener('end', resume)
      window.clearTimeout(timer)
    }
  }, [ready, selected, reduced])

  // ---- fly to selection ----------------------------------------------------------------------
  useEffect(() => {
    const g = globeRef.current
    if (!g || !ready || !selected) return
    const f = featureByCode.get(selected)
    const pose = f ? poseForFeature(f) : poseForPoint(countries.get(selected)?.latlng ?? null)
    if (pose) g.pointOfView(pose, reduced ? 0 : 1400)
  }, [selected, ready, featureByCode, countries, reduced, focusNonce])

  // ---- keep the focused country centred in the free area beside the panel ------------------
  const offsetRef = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const g = globeRef.current
    if (!g || !ready) return
    const cam = g.camera() as PerspectiveCamera
    const target = { x: insets.right / 2, y: insets.bottom / 2 }
    let raf = 0
    const step = () => {
      const o = offsetRef.current
      o.x += (target.x - o.x) * (reduced ? 1 : 0.12)
      o.y += (target.y - o.y) * (reduced ? 1 : 0.12)
      if (Math.abs(target.x - o.x) < 0.4) o.x = target.x
      if (Math.abs(target.y - o.y) < 0.4) o.y = target.y
      cam.setViewOffset(size.width, size.height, o.x, o.y, size.width, size.height)
      if (o.x !== target.x || o.y !== target.y) raf = requestAnimationFrame(step)
    }
    step()
    return () => cancelAnimationFrame(raf)
  }, [insets.right, insets.bottom, size.width, size.height, ready, reduced])

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0"
      style={{ cursor: hovered ? 'pointer' : 'grab' }}
      aria-hidden="true"
    >
      <Globe
        ref={globeRef}
        width={size.width}
        height={size.height}
        backgroundImageUrl={TEX.sky}
        globeMaterial={globeMaterial}
        globeImageUrl={satellite ? TEX.day : null}
        bumpImageUrl={satellite ? TEX.bump : null}
        showAtmosphere
        atmosphereColor="#5b9bff"
        atmosphereAltitude={0.17}
        polygonsData={features}
        polygonCapColor={capColor}
        polygonSideColor={sideColor}
        polygonStrokeColor={strokeColor}
        polygonAltitude={altitude}
        polygonCapCurvatureResolution={4}
        polygonsTransitionDuration={reduced ? 0 : 250}
        polygonLabel={label}
        onPolygonHover={(p) => setHovered(p ? (p as CountryFeature).properties.code : null)}
        onPolygonClick={(p) => onSelect((p as CountryFeature).properties.code)}
        onZoom={(pov) => onPoseChange({ lat: pov.lat, lng: pov.lng, altitude: pov.altitude })}
        onGlobeReady={handleReady}
        rendererConfig={{ antialias: true, powerPreference: 'high-performance' }}
      />
    </div>
  )
}

