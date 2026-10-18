import { geoNaturalEarth1, geoPath } from 'd3-geo'
import type { CountryFeature } from '@/lib/geo'

export const TRAVEL_COLORS = {
  VISITED: '#4fd1a5',
  LIVED: '#6fa8ff',
  WISHLIST: '#f6c177',
  NONE: '#26324a',
} as const

export interface ShareData {
  title: string
  subtitle: string
  bigNumber: string
  bigLabel: string
  regions: { label: string; visited: number; total: number }[]
  legend: { label: string; color: string }[]
  footer: string
  /** country code → colour */
  colorOf: (code: string) => string | null
  features: CountryFeature[]
}

/**
 * Draws a 1200×630 "travel card" (the Open Graph image size, good for social networks) on a canvas:
 * a world map with the visited countries, the headline numbers and progress per region.
 * The map uses d3-geo's Natural Earth projection rendered straight into the canvas context.
 */
export function drawShareImage(data: ShareData): HTMLCanvasElement {
  const W = 1200
  const H = 630
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')!

  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0d1626')
  bg.addColorStop(1, '#070b13')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)

  // map
  const projection = geoNaturalEarth1().fitExtent([[40, 150], [760, 560]], { type: 'Sphere' })
  const path = geoPath(projection, g)
  g.beginPath()
  path({ type: 'Sphere' })
  g.fillStyle = '#0b1220'
  g.fill()
  for (const f of data.features) {
    g.beginPath()
    path(f)
    g.fillStyle = data.colorOf(f.properties.code) ?? TRAVEL_COLORS.NONE
    g.fill()
    g.lineWidth = 0.4
    g.strokeStyle = 'rgba(6,10,18,0.9)'
    g.stroke()
  }

  // headline
  g.fillStyle = '#e8edf5'
  g.font = '600 44px Georgia, serif'
  g.fillText(data.title, 40, 76)
  g.fillStyle = '#8a97ab'
  g.font = '400 22px system-ui, sans-serif'
  g.fillText(data.subtitle, 40, 112)

  // big number
  g.fillStyle = '#e8edf5'
  g.font = '600 120px Georgia, serif'
  g.fillText(data.bigNumber, 820, 230)
  g.fillStyle = '#8a97ab'
  g.font = '400 22px system-ui, sans-serif'
  g.fillText(data.bigLabel, 824, 268)

  // regions
  let y = 320
  for (const r of data.regions) {
    g.fillStyle = '#c9d3e3'
    g.font = '500 18px system-ui, sans-serif'
    g.fillText(r.label, 824, y)
    g.fillStyle = '#8a97ab'
    g.textAlign = 'right'
    g.fillText(`${r.visited}/${r.total}`, 1160, y)
    g.textAlign = 'left'
    g.fillStyle = 'rgba(160,190,235,0.12)'
    g.fillRect(824, y + 10, 336, 6)
    g.fillStyle = TRAVEL_COLORS.VISITED
    g.fillRect(824, y + 10, 336 * (r.visited / Math.max(1, r.total)), 6)
    y += 46
  }

  // legend + footer
  let x = 40
  g.font = '400 16px system-ui, sans-serif'
  for (const l of data.legend) {
    g.fillStyle = l.color
    g.beginPath()
    g.arc(x + 6, 596, 6, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#c9d3e3'
    g.fillText(l.label, x + 18, 602)
    x += g.measureText(l.label).width + 44
  }
  g.fillStyle = '#6fa8ff'
  g.font = '600 18px system-ui, sans-serif'
  g.textAlign = 'right'
  g.fillText(data.footer, 1160, 602)
  g.textAlign = 'left'
  return canvas
}

/** Shares the image with the native share sheet when possible, otherwise downloads it. */
export async function shareOrDownload(canvas: HTMLCanvasElement, fileName: string, title: string) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return
  const file = new File([blob], fileName, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return
    } catch {
      // cancelled – fall back to download
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
