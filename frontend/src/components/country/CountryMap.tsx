import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { geoCentroid, geoMercator, geoPath } from 'd3-geo'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import type { Country } from '@/types'
import type { Boundaries, CountryFeature } from '@/lib/geo'
import { largestPolygon } from '@/lib/geo'
import { Button } from '@/components/ui/button'

interface CountryMapProps {
  country: Country
  boundaries: Boundaries
  byCode: Map<string, Country>
}

const W = 900
const H = 560
const MIN_K = 0.6
const MAX_K = 40

interface Transform {
  k: number
  x: number
  y: number
}
const IDENTITY: Transform = { k: 1, x: 0, y: 0 }

/** Pan/zoom regional map: the country, its land neighbours, and the surrounding context. */
export function CountryMap({ country, boundaries, byCode }: CountryMapProps) {
  const navigate = useNavigate()
  const svgRef = useRef<SVGSVGElement>(null)
  const [t, setT] = useState<Transform>(IDENTITY)
  const [hover, setHover] = useState<string | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ t: Transform; dist: number; moved: boolean } | null>(null)

  const features = boundaries.features as CountryFeature[]
  const self = features.find((f) => f.properties.code === country.code)

  const { paths, labels } = useMemo(() => {
    if (!self) return { paths: [], labels: [] }
    const main = largestPolygon(self)
    const [lng] = geoCentroid(main)
    const projection = geoMercator()
      .rotate([-lng, 0])
      .fitExtent(
        [
          [64, 56],
          [W - 64, H - 56],
        ],
        main,
      )
    const gen = geoPath(projection)
    const near = new Set([country.code, ...country.borders])
    const paths = features
      .map((f) => ({ code: f.properties.code, name: f.properties.name, d: gen(f) ?? '', role: f.properties.code === country.code ? 'self' : near.has(f.properties.code) ? 'neighbour' : 'other' }))
      .filter((p) => p.d)
    const labels = features
      .filter((f) => near.has(f.properties.code))
      .map((f) => {
        const [x, y] = projection(geoCentroid(largestPolygon(f))) ?? [NaN, NaN]
        return { code: f.properties.code, name: byCode.get(f.properties.code)?.name ?? f.properties.name, x, y, self: f.properties.code === country.code }
      })
      .filter((l) => Number.isFinite(l.x) && l.x > 0 && l.x < W && l.y > 0 && l.y < H)
    return { paths, labels }
  }, [self, features, country, byCode])

  const reset = () => setT(IDENTITY)
  useEffect(reset, [country.code])

  const zoomAt = (px: number, py: number, factor: number) =>
    setT((cur) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, cur.k * factor))
      const f = k / cur.k
      return { k, x: px - (px - cur.x) * f, y: py - (py - cur.y) * f }
    })

  // Wheel zoom needs a non-passive listener to prevent page scroll.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const px = ((e.clientX - r.left) / r.width) * W
      const py = ((e.clientY - r.top) / r.height) * H
      zoomAt(px, py, Math.exp(-e.deltaY * 0.0015))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const toSvg = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, scale: W / r.width }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    svgRef.current?.setPointerCapture(e.pointerId)
    const p = toSvg(e)
    pointers.current.set(e.pointerId, { x: p.x, y: p.y })
    const pts = [...pointers.current.values()]
    gesture.current = {
      t,
      moved: false,
      dist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev || !gesture.current) return
    const p = toSvg(e)
    pointers.current.set(e.pointerId, { x: p.x, y: p.y })
    const pts = [...pointers.current.values()]
    if (pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (gesture.current.dist > 0) {
        zoomAt((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2, dist / gesture.current.dist)
      }
      gesture.current.dist = dist
      gesture.current.moved = true
    } else {
      const dx = p.x - prev.x
      const dy = p.y - prev.y
      if (Math.abs(dx) + Math.abs(dy) > 0.5) gesture.current.moved = true
      setT((cur) => ({ ...cur, x: cur.x + dx, y: cur.y + dy }))
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) window.setTimeout(() => (gesture.current = null), 0)
  }

  if (!self) {
    return (
      <div className="flex aspect-[900/560] items-center justify-center rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Boundary data isn’t available for {country.name}, so a map can’t be drawn. See the locator for its position.
      </div>
    )
  }

  const hoveredName = hover ? (byCode.get(hover)?.name ?? hover) : null

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-[radial-gradient(ellipse_at_center,#0f1d31,#0a111c)]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label={`Map of ${country.name} and its surroundings. Drag to pan, scroll to zoom.`}
        className="block w-full touch-none select-none"
        style={{ cursor: gesture.current?.moved ? 'grabbing' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
          {paths.map((p) => {
            const interactive = p.role !== 'other'
            const isHover = hover === p.code
            return (
              <path
                key={p.code}
                d={p.d}
                vectorEffect="non-scaling-stroke"
                fill={
                  p.role === 'self'
                    ? isHover ? '#8bbcff' : '#6fa8ff'
                    : p.role === 'neighbour'
                      ? isHover ? '#3b5276' : '#2a3c58'
                      : '#18243a'
                }
                fillOpacity={p.role === 'self' ? 0.85 : 1}
                stroke={p.role === 'self' ? '#d6e8ff' : 'rgba(160,190,235,0.28)'}
                strokeWidth={p.role === 'self' ? 1.4 : 0.8}
                className={interactive && p.role === 'neighbour' ? 'cursor-pointer' : undefined}
                onPointerEnter={() => interactive && setHover(p.code)}
                onPointerLeave={() => setHover(null)}
                onClick={() => {
                  if (p.role === 'neighbour' && !gesture.current?.moved) navigate(`/countries/${p.code}/geography`)
                }}
              >
                <title>{byCode.get(p.code)?.name ?? p.name}</title>
              </path>
            )
          })}
          {labels.map((l) => (
            <text
              key={l.code}
              x={l.x}
              y={l.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={(l.self ? 15 : 12) / Math.sqrt(t.k)}
              fontWeight={l.self ? 600 : 500}
              fill={l.self ? '#06101f' : '#c9d6ea'}
              pointerEvents="none"
              style={{ paintOrder: 'stroke', stroke: l.self ? 'rgba(214,232,255,0.5)' : 'rgba(10,16,26,0.8)', strokeWidth: 3 / Math.sqrt(t.k) }}
            >
              {l.name}
            </text>
          ))}
        </g>
      </svg>

      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <Button variant="outline" size="icon-sm" aria-label="Zoom in" className="bg-background/70 backdrop-blur" onClick={() => zoomAt(W / 2, H / 2, 1.6)}>
          <Plus />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Zoom out" className="bg-background/70 backdrop-blur" onClick={() => zoomAt(W / 2, H / 2, 1 / 1.6)}>
          <Minus />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Reset view" className="bg-background/70 backdrop-blur" onClick={reset}>
          <RotateCcw />
        </Button>
      </div>
      <p className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-muted-foreground" aria-live="polite">
        {hoveredName ?? 'Drag to pan · scroll to zoom · click a neighbour to open it'}
      </p>
    </div>
  )
}
