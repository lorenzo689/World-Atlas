import { describe, expect, it } from 'vitest'
import { formatArea, formatCompact, formatCoordinate, formatCurrencyCompact, formatNumber, formatPercent, pluralize } from '../format'

describe('format helpers', () => {
  it('renders an em dash for missing values instead of inventing one', () => {
    for (const fn of [formatNumber, formatCompact, formatPercent, formatCurrencyCompact, formatArea]) {
      expect(fn(null)).toBe('—')
      expect(fn(undefined)).toBe('—')
      expect(fn(NaN)).toBe('—')
    }
  })

  it('formats numbers', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
    expect(formatCompact(83_491_249)).toBe('83.49M')
    expect(formatPercent(2.171, 1)).toBe('2.2%')
    expect(formatCurrencyCompact(4_500_000_000_000)).toBe('$4.50T')
    expect(formatArea(357114)).toBe('357,114 km²')
  })

  it('formats coordinates with hemispheres', () => {
    expect(formatCoordinate(51, 9)).toBe('51.00° N, 9.00° E')
    expect(formatCoordinate(-33.9, -70.5)).toBe('33.90° S, 70.50° W')
  })

  it('pluralizes', () => {
    expect(pluralize(1, 'neighbour')).toBe('1 neighbour')
    expect(pluralize(3, 'country', 'countries')).toBe('3 countries')
  })
})
