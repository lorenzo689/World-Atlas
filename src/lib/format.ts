const EN = 'en-US'
const DASH = '—'

const isNum = (v: number | null | undefined): v is number => v != null && Number.isFinite(v)

export function formatNumber(value: number | null | undefined, maximumFractionDigits = 0): string {
  if (!isNum(value)) return DASH
  return new Intl.NumberFormat(EN, { maximumFractionDigits }).format(value)
}

/** 1 234 567 → "1.23M". */
export function formatCompact(value: number | null | undefined): string {
  if (!isNum(value)) return DASH
  return new Intl.NumberFormat(EN, { notation: 'compact', maximumFractionDigits: 2 }).format(value)
}

export function formatCurrencyCompact(value: number | null | undefined): string {
  if (!isNum(value)) return DASH
  return new Intl.NumberFormat(EN, {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatCurrency(value: number | null | undefined): string {
  if (!isNum(value)) return DASH
  return new Intl.NumberFormat(EN, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (!isNum(value)) return DASH
  // Avoid "-0%" for small non-zero values such as -0.04.
  const d = value !== 0 && Math.abs(value) < 0.1 ? Math.max(digits, 2) : digits
  return `${formatNumber(value, d)}%`
}

export function formatYears(value: number | null | undefined, digits = 1): string {
  if (!isNum(value)) return DASH
  return `${formatNumber(value, digits)} yrs`
}

export function formatArea(km2: number | null | undefined): string {
  if (!isNum(km2)) return DASH
  return `${formatNumber(km2)} km²`
}

export function formatCoordinate(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lng).toFixed(2)}° ${ew}`
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
