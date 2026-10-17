import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Country, GlobeMode } from '@/types'
import type { Boundaries, CountryFeature, Pose } from '@/lib/geo'
import { poseForFeature, poseForPoint } from '@/lib/geo'
import { buildChoropleth, hash01, mix, NO_DATA_COLOR, REGION_COLORS } from '@/lib/color'
import type { IndicatorMeta } from '@/lib/indicators'
import type { LatestValue } from '@/lib/worldbank'
import { usePrefersReducedMotion } from '@/hooks/useMisc'
import { GlobeScene } from '@/lib/globeScene'
import type { HighlightStyle } from '@/lib/globeLayers'
import { PERF_DEBUG, startPerfProbe } from '@/lib/perf'
import { commonsFlagUrl, type HistoricalEntity } from '@/lib/history'

const BASE = import.meta.env.BASE_URL
// Phones and low-memory devices get the 2k colour map (a quarter of the GPU memory).
const LOW_END =
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches ||
    ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4)
const TEX = {
  day: `${BASE}textures/earth-blue-marble${LOW_END ? '-2k' : ''}.webp`,
  bump: `${BASE}textures/earth-topology.webp`,
  water: `${BASE}textures/earth-water.webp`,
  sky: `${BASE}textures/night-sky.webp`,
}
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
  /** Hover tooltips with the country name (off in the quiz, where they would give the answer away). */
  tooltips?: boolean
  /** A second highlighted country (comparison), drawn in amber. */
  secondary?: string | null
  /** Custom fill per country (political/data modes); null = neutral. Used by the travel map. */
  paint?: ((code: string) => string | null) | null
  /** Dots on the globe, e.g. where the other players clicked. */
  markers?: GlobeMarker[]
  /** Historical entities have their own names and dated flags, separate from current country metadata. */
  historicalEntities?: Map<string, HistoricalEntity> | null
  /** Follow a camera controlled by another globe (historical side-by-side view). */
  externalPose?: Pose | null
}

export interface GlobeMarker {
  lat: number
  lng: number
  color: string
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
  tooltips = true,
  secondary = null,
  paint = null,
  markers,
  historicalEntities = null,
  externalPose = null,
}: GlobeViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<GlobeScene | null>(null)
  const [ready, setReady] = useState(false)
  const reduced = usePrefersReducedMotion()

  const features = boundaries.features as CountryFeature[]
  const featureByCode = useMemo(() => new Map(features.map((f) => [f.properties.code, f])), [features])

  // ---- choropleth + per-country base colour -------------------------------------------------
  const choropleth = useMemo(() => {
    if (!values) return null
    const nums: number[] = []
    for (const f of features) {
      const v = values.get(f.properties.code)
      if (v) nums.push(v.value)
    }
    return buildChoropleth(nums)
  }, [values, features])

  const baseColor = useCallback(
    (code: string) => {
      if (mode === 'political') {
        const c = countries.get(historicalEntities?.get(code)?.iso ?? code)
        const region = REGION_COLORS[c?.region ?? ''] ?? '#6d7a8c'
        // Slight per-country variation so neighbours in the same region stay distinguishable.
        return mix(region, hash01(code) > 0.5 ? '#ffffff' : '#000000', 0.04 + hash01(code + 'x') * 0.14)
      }
      const v = values?.get(code)
      return v && choropleth ? choropleth.color(v.value) : NO_DATA_COLOR
    },
    [mode, countries, values, choropleth, historicalEntities],
  )

  const highlightStyle = useCallback(
    (code: string, isSelected: boolean): HighlightStyle => {
      const base = {
        lineColor: isSelected ? '#d6e8ff' : '#bed7ff',
        lineOpacity: isSelected ? 0.95 : 0.85,
        altitude: isSelected ? 0.022 : 0.014,
      }
      if (mode === 'satellite') {
        return { ...base, capColor: '#6fa8ff', capOpacity: isSelected ? 0.36 : 0.26 }
      }
      return { ...base, capColor: mix(baseColor(code), '#ffffff', isSelected ? 0.38 : 0.22), capOpacity: 1 }
    },
    [mode, baseColor],
  )

  const tooltipHtml = useCallback(
    (code: string) => {
      if (historicalEntities) {
        const entity = historicalEntities.get(code)
        if (!entity) return ''
        const flag = entity.flagFile ? `<img src="${esc(commonsFlagUrl(entity.flagFile))}" alt="" />` : ''
        return `${flag}<div>${esc(entity.name)}<small>${esc(entity.capital ?? '')}</small></div>`
      }
      const c = countries.get(code)
      if (!c) return ''
      let sub = [c.capital[0], c.subregion ?? c.region].filter(Boolean).join(' · ')
      if (mode === 'data') {
        const v = values?.get(code)
        sub = v ? `${metric.format(v.value)} · ${v.year}` : 'No data reported'
      }
      return `<img src="${BASE}flags/${esc(code)}.svg" alt="" /><div>${esc(c.name)}<small>${esc(sub)}</small></div>`
    },
    [countries, mode, values, metric, historicalEntities],
  )

  // Latest values for the scene callbacks (the scene is created once and must not see stale props).
  const live = useRef({ onSelect, onPoseChange, onReady, highlightStyle, tooltipHtml, selected, tooltips })
  live.current = { onSelect, onPoseChange, onReady, highlightStyle, tooltipHtml, selected, tooltips }
  const hoverRef = useRef<string | null>(null)
  const tipCode = useRef<string | null>(null)
  const initial = useRef({ initialPose, reduced, mode, features, boundaries })
  const mapRef = useRef(boundaries)

  // ---- scene lifecycle ----------------------------------------------------------------------
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const { initialPose: start0, reduced: red, mode: mode0, features: firstFeatures, boundaries: firstBoundaries } = initial.current
    const s = new GlobeScene(
      el,
      {
        textures: TEX,
        features: firstFeatures,
        borders: firstBoundaries.borders,
        precomputed: firstBoundaries.geometry,
        satellite: mode0 === 'satellite',
        reducedMotion: red,
        fixedQuality: PERF_DEBUG && !/[?&]adaptive=1/.test(window.location.search),
      },
      {
        onPose: (p) => live.current.onPoseChange(p),
        onClick: (code) => live.current.onSelect(code),
        onHover: (code, x, y) => {
          hoverRef.current = code
          const { selected: sel, highlightStyle: style, tooltipHtml: html } = live.current
          if (code && code !== sel) s.layers.hover.style(style(code, false))
          else s.layers.hover.group.visible = false
          const tip = tipRef.current
          if (!tip) return
          if (!code || !live.current.tooltips) {
            tip.style.opacity = '0'
            tipCode.current = null
            return
          }
          if (tipCode.current !== code) {
            tip.innerHTML = `<div class="globe-tip">${html(code)}</div>`
            tipCode.current = code
          }
          tip.style.opacity = '1'
          tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -140%)`
        },
        onReady: () => {
          if (!start0 && !red) s.pointOfView(DEFAULT_POSE, 2600)
          setReady(true)
          live.current.onReady()
        },
      },
    )
    const target = start0 ?? DEFAULT_POSE
    s.pointOfView(start0 || red ? target : { ...target, altitude: 5.5 }, 0)
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width && height) s.setSize(width, height)
    })
    ro.observe(el)
    const r = el.getBoundingClientRect()
    s.setSize(r.width || window.innerWidth, r.height || window.innerHeight)
    setScene(s)
    return () => {
      ro.disconnect()
      setScene(null)
      setReady(false)
      s.dispose()
    }
  }, [])

  useEffect(() => {
    if (!scene || mapRef.current === boundaries) return
    mapRef.current = boundaries
    hoverRef.current = null
    tipCode.current = null
    scene.replaceMap(features, boundaries.borders, boundaries.geometry)
  }, [scene, boundaries, features])

  // ---- base map colours / mode --------------------------------------------------------------
  useEffect(() => {
    if (!scene) return
    const { layers } = scene
    scene.setSatellite(mode === 'satellite')
    layers.caps.visible = mode !== 'satellite'
    if (mode !== 'satellite') layers.setCapColors(paint ? (code) => paint(code) ?? '#243044' : baseColor)
    if (mode === 'satellite') layers.setBorder('#ffffff', 0.26)
    else layers.setBorder('#080d16', 0.75)
    scene.requestRender()
  }, [scene, mode, baseColor, paint, boundaries])

  // ---- secondary highlight (comparison) -------------------------------------------------------
  useEffect(() => {
    if (!scene) return
    scene.layers.secondary.set(secondary)
    if (secondary) {
      scene.layers.secondary.style({
        capColor: '#f6c177',
        capOpacity: mode === 'satellite' ? 0.4 : 0.85,
        lineColor: '#ffe2b0',
        lineOpacity: 0.95,
        altitude: 0.018,
      })
    }
    scene.requestRender()
  }, [scene, secondary, mode])

  // ---- markers ---------------------------------------------------------------------------------
  useEffect(() => {
    if (!scene) return
    scene.layers.setMarkers(markers ?? [])
    scene.requestRender()
  }, [scene, markers])

  // ---- selection highlight ------------------------------------------------------------------
  useEffect(() => {
    if (!scene) return
    const { layers } = scene
    layers.selected.set(selected)
    if (selected) layers.selected.style(highlightStyle(selected, true))
    // keep the hover slot consistent with the new selection / colours
    const h = hoverRef.current
    layers.hover.set(h && h !== selected ? h : null)
    if (h && h !== selected) layers.hover.style(highlightStyle(h, false))
    scene.requestRender()
  }, [scene, selected, highlightStyle, boundaries])

  // ---- insets, auto-rotate ------------------------------------------------------------------
  useEffect(() => {
    scene?.setInsets(insets.right, insets.bottom)
  }, [scene, insets.right, insets.bottom])

  useEffect(() => {
    if (scene && externalPose) scene.pointOfView(externalPose, 0)
  }, [scene, externalPose])

  useEffect(() => {
    scene?.setAutoRotate(!reduced && !selected && !externalPose)
  }, [scene, reduced, selected, externalPose])

  // ---- fly to selection ---------------------------------------------------------------------
  useEffect(() => {
    if (!scene || !ready || !selected) return
    const f = featureByCode.get(selected)
    const pose = f ? poseForFeature(f) : poseForPoint(countries.get(selected)?.latlng ?? null)
    if (pose) scene.pointOfView(pose, reduced ? 0 : 1400)
  }, [scene, selected, ready, featureByCode, countries, reduced, focusNonce])

  // ---- perf probe (?debug=1): overlay + window.__perf for scripts/perf.mjs -------------------
  useEffect(() => {
    if (!PERF_DEBUG || !scene || !ready) return
    window.__globePose = () => scene.getPose()
    const stop = startPerfProbe(() => scene.renderer)
    return () => {
      stop()
      delete window.__globePose
    }
  }, [scene, ready])

  return (
    <div ref={wrapRef} className="absolute inset-0" aria-hidden="true">
      <div
        ref={tipRef}
        className="pointer-events-none absolute left-0 top-0 z-10 opacity-0 transition-opacity duration-100"
        style={{ willChange: 'transform' }}
      />
    </div>
  )
}
