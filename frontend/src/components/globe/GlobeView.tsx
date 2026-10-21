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
import type { BorderSegment } from '@/lib/historyBoundaryDiff'
import type { AreaMesh } from '@/lib/historyAreaDiff'
import { pickTerritory, type TerritoryArea, type Territory } from '@/lib/territories'

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
  conflictLines?: number[][][] | null
  ww2Fronts?: number[][][] | null
  onMarkerSelect?: (index: number) => void
  /** Geometric difference from the other historical snapshot. */
  changeLines?: { segments: BorderSegment[]; color: string } | null
  changeAreas?: { mesh: AreaMesh; color: string } | null
  territoryAreas?: TerritoryArea[]
  visibleTerritories?: ReadonlySet<string>
  territoryFeatures?: Territory[]
  onTerritorySelect?: (id: string) => void
  /** Historical entities have their own names and dated flags, separate from current country metadata. */
  historicalEntities?: Map<string, HistoricalEntity> | null
  /** Follow a camera controlled by another globe (historical side-by-side view). */
  externalPose?: Pose | null
  focusPose?: Pose | null
}

export interface GlobeMarker {
  lat: number
  lng: number
  color: string
}

interface TooltipData { image?: string; title: string; subtitle: string }

function setTooltip(tip: HTMLElement, data: TooltipData | null) {
  const root = document.createElement('div')
  root.className = 'globe-tip'
  if (data?.image) {
    const image = document.createElement('img')
    image.src = data.image
    image.alt = ''
    root.append(image)
  }
  const content = document.createElement('div')
  content.textContent = data?.title ?? ''
  const subtitle = document.createElement('small')
  subtitle.textContent = data?.subtitle ?? ''
  content.append(subtitle)
  root.append(content)
  tip.replaceChildren(root)
}

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
  conflictLines = null,
  ww2Fronts = null,
  onMarkerSelect,
  changeLines = null,
  changeAreas = null,
  territoryAreas,
  visibleTerritories,
  territoryFeatures,
  onTerritorySelect,
  historicalEntities = null,
  externalPose = null,
  focusPose = null,
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
        altitude: isSelected ? 0.0018 : 0.0012,
      }
      if (mode === 'satellite') {
        return { ...base, capColor: '#6fa8ff', capOpacity: isSelected ? 0.36 : 0.26 }
      }
      return { ...base, capColor: mix(baseColor(code), '#ffffff', isSelected ? 0.38 : 0.22), capOpacity: 1 }
    },
    [mode, baseColor],
  )

  const tooltipData = useCallback(
    (code: string) => {
      if (historicalEntities) {
        const entity = historicalEntities.get(code)
        if (!entity) return null
        return { image: entity.flagFile ? commonsFlagUrl(entity.flagFile) : undefined, title: entity.name, subtitle: entity.capital ?? '' }
      }
      const c = countries.get(code)
      if (!c) return null
      let sub = [c.capital[0], c.subregion ?? c.region].filter(Boolean).join(' · ')
      if (mode === 'data') {
        const v = values?.get(code)
        sub = v ? `${metric.format(v.value)} · ${v.year}` : 'No data reported'
      }
      return { image: `${BASE}flags/${encodeURIComponent(code)}.svg`, title: c.name, subtitle: sub }
    },
    [countries, mode, values, metric, historicalEntities],
  )

  // Latest values for the scene callbacks (the scene is created once and must not see stale props).
  const live = useRef({ onSelect, onPoseChange, onReady, highlightStyle, tooltipData, selected, tooltips, markers, onMarkerSelect, territoryFeatures, visibleTerritories, onTerritorySelect })
  live.current = { onSelect, onPoseChange, onReady, highlightStyle, tooltipData, selected, tooltips, markers, onMarkerSelect, territoryFeatures, visibleTerritories, onTerritorySelect }
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
        detailEnabled: historicalEntities === null,
        detailLowEnd: LOW_END,
        imageDetailEnabled: !LOW_END,
        reducedMotion: red,
        fixedQuality: PERF_DEBUG && !/[?&]adaptive=1/.test(window.location.search),
      },
      {
        onPose: (p) => live.current.onPoseChange(p),
        onClick: (code) => live.current.onSelect(code),
        onGlobeClick: (lat, lng) => {
          const { markers: dots, onMarkerSelect: choose } = live.current
          if (dots?.length && choose) {
            const closest = dots.map((dot, index) => ({ index, distance: Math.hypot(dot.lat - lat, (dot.lng - lng) * Math.cos(lat * Math.PI / 180)) })).sort((a, b) => a.distance - b.distance)[0]
            if (closest && closest.distance <= 5) { choose(closest.index); return true }
          }
          const { territoryFeatures: areas, visibleTerritories: visible, onTerritorySelect: selectArea } = live.current
          const territory = areas && visible && selectArea ? pickTerritory(areas, visible, lng, lat) : null
          if (territory) { selectArea?.(territory.id); return true }
          return false
        },
        onHover: (code, x, y) => {
          hoverRef.current = code
          const { selected: sel, highlightStyle: style, tooltipData: data } = live.current
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
            setTooltip(tip, data(code))
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
    scene.setMapDetailEnabled(historicalEntities === null)
    scene.setImageDetailEnabled(!LOW_END)
  }, [scene, boundaries, features, historicalEntities])

  useEffect(() => {
    if (!scene) return
    scene.layers.setConflictLines(conflictLines)
    scene.requestRender()
  }, [scene, boundaries, conflictLines])

  useEffect(() => {
    if (!scene) return
    scene.layers.setWw2Fronts(ww2Fronts)
    scene.requestRender()
  }, [scene, boundaries, ww2Fronts])

  useEffect(() => {
    if (!scene) return
    scene.layers.setTerritories(territoryAreas ?? [], visibleTerritories ?? new Set())
    scene.requestRender()
  }, [scene, boundaries, territoryAreas, visibleTerritories])

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
        altitude: 0.0015,
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

  useEffect(() => {
    if (!scene) return
    scene.layers.setChangeLines(changeLines?.segments ?? [], changeLines?.color ?? '#f6c177')
    scene.requestRender()
  }, [scene, changeLines, boundaries])

  useEffect(() => {
    if (!scene) return
    scene.layers.setChangeAreas(changeAreas?.mesh ?? null, changeAreas?.color ?? '#f6c177')
    scene.requestRender()
  }, [scene, changeAreas, boundaries])

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

  // ---- insets and external camera -------------------------------------------------------------
  useEffect(() => {
    scene?.setInsets(insets.right, insets.bottom)
  }, [scene, insets.right, insets.bottom])

  useEffect(() => {
    if (scene && externalPose) scene.pointOfView(externalPose, 0)
  }, [scene, externalPose])

  useEffect(() => {
    if (scene && ready && focusPose) scene.pointOfView(focusPose, reduced ? 0 : 1200)
  }, [scene, ready, focusPose, reduced])

  // ---- fly to selection ---------------------------------------------------------------------
  useEffect(() => {
    if (!scene || !ready || !selected) return
    const f = featureByCode.get(selected)
    const pose = f ? poseForFeature(f) : poseForPoint(countries.get(selected)?.latlng ?? null)
    if (pose) scene.pointOfView(pose, reduced ? 0 : 1400)
  }, [scene, selected, ready, featureByCode, countries, reduced, focusNonce])

  // ---- perf probe (?debug=1): overlay + window.__perf for scripts/perf.mjs -------------------
  useEffect(() => {
    if (!PERF_DEBUG || !scene || !ready || externalPose) return
    const getPose = () => scene.getPose()
    const getDetail = () => scene.getDetailDiagnostics()
    window.__globePose = getPose
    window.__globeDetail = getDetail
    const stop = startPerfProbe(() => scene.renderer)
    return () => {
      stop()
      if (window.__globePose === getPose) delete window.__globePose
      if (window.__globeDetail === getDetail) delete window.__globeDetail
    }
  }, [scene, ready, externalPose])

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
