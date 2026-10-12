import { describe, expect, it } from 'vitest'
import { parseLatestAll, parseSeries } from '../worldbank'

const meta = { page: 1, pages: 1, per_page: 100, total: 3, lastupdated: '2026-10-08' }
const row = (date: string, value: number | null, iso = 'DEU') => ({
  indicator: { id: 'SP.POP.TOTL', value: 'Population, total' },
  countryiso3code: iso,
  date,
  value,
})

describe('parseSeries', () => {
  it('drops null observations, sorts ascending and exposes the latest point', () => {
    const s = parseSeries([meta, [row('2024', 83), row('2025', null), row('2022', 80)]], 'SP.POP.TOTL')
    expect(s.points).toEqual([
      { year: 2022, value: 80 },
      { year: 2024, value: 83 },
    ])
    expect(s.latest).toEqual({ year: 2024, value: 83 })
    expect(s.label).toBe('Population, total')
    expect(s.lastUpdated).toBe('2026-10-08')
  })

  it('returns an empty series (not fabricated values) when nothing is published', () => {
    const s = parseSeries([meta, [row('2024', null)]], 'X')
    expect(s.points).toEqual([])
    expect(s.latest).toBeNull()
  })

  it('handles a null data page', () => {
    expect(parseSeries([meta, null], 'X').points).toEqual([])
  })

  it('throws on World Bank error payloads', () => {
    expect(() => parseSeries([{ message: [{ id: '120', value: 'Invalid value' }] }], 'X')).toThrow('Invalid value')
  })
})

describe('parseLatestAll', () => {
  it('keeps only rows with a 3-letter country code and a value', () => {
    const m = parseLatestAll([meta, [row('2025', 83, 'DEU'), row('2025', 1, ''), row('2025', null, 'FRA'), row('2024', 7, 'WLD')]])
    expect([...m.keys()].sort()).toEqual(['DEU', 'WLD'])
    expect(m.get('DEU')).toEqual({ year: 2025, value: 83 })
  })
})
