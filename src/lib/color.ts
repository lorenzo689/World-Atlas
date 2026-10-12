import { scaleQuantile } from 'd3-scale'

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Mix `hex` toward `target` by `amount` (0–1). */
export function mix(hex: string, target: string, amount: number): string {
  const a = hexToRgb(hex)
  const b = hexToRgb(target)
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * amount))
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** Stable pseudo-random 0–1 value derived from a string. */
export function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000) / 1000
}

/** Muted regional tones for the Political mode, tuned to sit on a near-black ocean. */
export const REGION_COLORS: Record<string, string> = {
  Africa: '#8a7551',
  Americas: '#4f7f6c',
  Asia: '#5a74a8',
  Europe: '#7e6794',
  Oceania: '#4a8e98',
  Antarctic: '#9aa7b6',
}

/** Low → high ramp for Data mode: dim navy to luminous ice-blue. */
export const DATA_RAMP = ['#1c3252', '#244d7f', '#2d6cad', '#3f8fd4', '#66b3ea', '#9bd4f5', '#d6f0ff']
export const NO_DATA_COLOR = '#18212f'

export interface ChoroplethScale {
  color: (value: number) => string
  /** Lower bound of each class plus the overall max, for the legend. */
  breaks: number[]
}

export function buildChoropleth(values: number[]): ChoroplethScale | null {
  if (values.length < DATA_RAMP.length) return null
  const q = scaleQuantile<string>().domain(values).range(DATA_RAMP)
  const sorted = [...values].sort((a, b) => a - b)
  return {
    color: (v) => q(v),
    breaks: [sorted[0], ...q.quantiles(), sorted[sorted.length - 1]],
  }
}
