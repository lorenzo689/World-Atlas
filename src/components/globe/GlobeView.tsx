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
import { BaseLayers } from '@/lib/globeLayers'

const BASE = import.meta.env.BASE_URL
const TEX = {
  day: `${BASE}textures/earth-blue-marble.jpg`,
  bump: `${BASE}textures/earth-topology.png`,
  water: `${BASE}textures/earth-water.png`,
  sky: `${BASE}textures/night-sky.png`,
}
const OCEAN = '#0b1626'
const SIDE_COLOR = 'rgba(111,168,255,0.28)'
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

  // ---- base map: every country in two draw calls ---------------------------------------------
  // react-globe.gl's polygons layer costs ~3 draw calls per polygon piece (1,600+ here), so it is
  // only used for the highlighted countries; the rest is one merged mesh + one merged line set.
  const base = useMemo(() => new BaseLayers(features), [features])
  useEffect(() => {
    const g = globeRef.current
    if (!g || !ready) return
    const scene = g.scene()
    scene.add(base.group)
    return () => {
      scene.remove(base.group)
    }
  }, [base, ready])
  useEffect(() => () => base.dispose(), [base])

  const baseColor = useCallback(
    (code: string) => {
      if (mode === 'political') {
        const c = countries.get(code)
        const region = REGION_COLORS[c?.region ?? ''] ?? '#6d7a8c'
        // Slight per-country variation so neighbours in the same region stay distinguishable.
        return mix(region, hash01(code) > 0.5 ? '#ffffff' : '#000000', 0.04 + hash01(code + 'x') * 0.14)
      }
      const v = values?.get(code)
      return v && choropleth ? choropleth.color(v.value) : NO_DATA_COLOR
    },
    [mode, countries, values, choropleth],
  )

  useEffect(() => {
    base.caps.visible = mode !== 'satellite'
    if (mode !== 'satellite') base.setCapColors(baseColor)
    if (mode === 'satellite') base.setBorder('#ffffff', 0.26)
    else base.setBorder('#080d16', 0.75)
  }, [base, mode, baseColor])

  // Only the hovered / selected countries go through the (expensive) polygons layer.
  const highlighted = useMemo(() => {
    const out: CountryFeature[] = []
    for (const code of [selected, hovered]) {
      const f = code ? featureByCode.get(code) : undefined
      if (f && !out.includes(f)) out.push(f)
    }
    return out
  }, [selected, hovered, featureByCode])

  const capColor = useCallback(
    (d: object) => {
      const code = (d as CountryFeature).properties.code
      const isSel = code === selected
      if (mode === 'satellite') return isSel ? 'rgba(111,168,255,0.36)' : 'rgba(111,168,255,0.26)'
      return mix(baseColor(code), '#ffffff', isSel ? 0.38 : 0.22)
    },
    [mode, selected, baseColor],
  )

  const strokeColor = useCallback(
    (d: object) =>
      (d as CountryFeature).properties.code === selected ? 'rgba(214,232,255,0.95)' : 'rgba(190,215,255,0.85)',
    [selected],
  )

  const altitude = useCallback(
    (d: object) => ((d as CountryFeature).properties.code === selected ? 0.022 : 0.014),
    [selected],
  )

  // ---- hover / click picking -----------------------------------------------------------------
  // Done against the globe sphere + point-in-polygon instead of raycasting thousands of triangles.
  useEffect(() => {
    const el = wrapRef.current
    if (!el || !ready) return
    let raf = 0
    let last: { x: number; y: number } | null = null
    const run = () => {
      raf = 0
      const g = globeRef.current
      if (!g || !last) return
      const rect = el.getBoundingClientRect()
      const hit = g.toGlobeCoords(last.x - rect.left, last.y - rect.top)
      const code = hit ? base.pick(hit.lng, hit.lat) : null
      setHovered((prev) => (prev === code ? prev : code))
    }
    const onMove = (e: PointerEvent) => {
      if (e.buttons !== 0) return // dragging the globe
      last = { x: e.clientX, y: e.clientY }
      if (!raf) raf = requestAnimationFrame(run)
    }
    const onLeave = () => {
      last = null
      setHovered(null)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(raf)
    }
  }, [base, ready])

  const handleGlobeClick = useCallback(
    ({ lat, lng }: { lat: number; lng: number }) => {
      const code = base.pick(lng, lat)
      if (code) onSelect(code)
    },
    [base, onSelect],
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
        polygonsData={highlighted}
        polygonCapColor={capColor}
        polygonSideColor={SIDE_COLOR}
        polygonStrokeColor={strokeColor}
        polygonAltitude={altitude}
        polygonCapCurvatureResolution={6}
        polygonsTransitionDuration={0}
        polygonLabel={label}
        onPolygonClick={(p) => onSelect((p as CountryFeature).properties.code)}
        onGlobeClick={handleGlobeClick}
        onZoom={(pov) => onPoseChange({ lat: pov.lat, lng: pov.lng, altitude: pov.altitude })}
        onGlobeReady={handleReady}
        rendererConfig={{ antialias: true, powerPreference: 'high-performance' }}
      />
    </div>
  )
}

