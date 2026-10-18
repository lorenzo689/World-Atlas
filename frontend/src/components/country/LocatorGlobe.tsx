import { useEffect, useRef } from 'react'
import { geoCentroid, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo'
import type { Country } from '@/types'
import type { Boundaries, CountryFeature } from '@/lib/geo'
import { largestPolygon } from '@/lib/geo'

interface LocatorGlobeProps {
  country: Country
  boundaries: Boundaries | null
  size?: number
  className?: string
}

const GRATICULE = geoGraticule10()

/** Small canvas globe that can be dragged to rotate, with the country highlighted. */
export function LocatorGlobe({ country, boundaries, size = 220, className }: LocatorGlobeProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)

    const features = (boundaries?.features ?? []) as CountryFeature[]
    const self = features.find((f) => f.properties.code === country.code)
    const point: [number, number] | null = self
      ? (geoCentroid(largestPolygon(self)) as [number, number])
      : country.latlng
        ? [country.latlng[1], country.latlng[0]]
        : null

    const projection = geoOrthographic()
      .translate([size / 2, size / 2])
      .scale(size / 2 - 6)
      .clipAngle(90)
    const path = geoPath(projection, ctx)
    let rotation: [number, number] = point ? [-point[0], -point[1]] : [0, -20]

    const draw = () => {
      projection.rotate([rotation[0], rotation[1]])
      ctx.clearRect(0, 0, size, size)
      ctx.beginPath()
      path({ type: 'Sphere' })
      ctx.fillStyle = '#0c1727'
      ctx.fill()
      ctx.beginPath()
      path(GRATICULE)
      ctx.strokeStyle = 'rgba(160,190,235,0.09)'
      ctx.lineWidth = 0.6
      ctx.stroke()
      ctx.beginPath()
      for (const f of features) if (f.properties.code !== country.code) path(f)
      ctx.fillStyle = '#22314a'
      ctx.fill()
      if (self) {
        ctx.beginPath()
        path(self)
        ctx.fillStyle = '#6fa8ff'
        ctx.fill()
        ctx.strokeStyle = '#d6e8ff'
        ctx.lineWidth = 1
        ctx.stroke()
      } else if (point) {
        const p = projection(point)
        if (p) {
          ctx.beginPath()
          ctx.arc(p[0], p[1], 4, 0, Math.PI * 2)
          ctx.fillStyle = '#6fa8ff'
          ctx.fill()
          ctx.strokeStyle = 'rgba(214,232,255,0.5)'
          ctx.lineWidth = 6
          ctx.stroke()
        }
      }
      ctx.beginPath()
      path({ type: 'Sphere' })
      ctx.strokeStyle = 'rgba(160,190,235,0.28)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    draw()

    // Drag to rotate
    let last: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY }
      canvas.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!last) return
      rotation = [
        rotation[0] + (e.clientX - last.x) * 0.4,
        Math.max(-90, Math.min(90, rotation[1] - (e.clientY - last.y) * 0.4)),
      ]
      last = { x: e.clientX, y: e.clientY }
      requestAnimationFrame(draw)
    }
    const up = () => (last = null)
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
    }
  }, [country, boundaries, size])

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={`Globe showing the location of ${country.name}. Drag to rotate.`}
      className={`cursor-grab touch-none active:cursor-grabbing ${className ?? ''}`}
      style={{ width: size, height: size }}
    />
  )
}
