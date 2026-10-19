import { describe, expect, it } from 'vitest'
import { comparableIso, parseRefugees } from '../historicalContext'
import type { HistoricalEntity } from '../history'

const entity = (iso: string | null, name = 'France'): HistoricalEntity => ({ code: 'H220', iso, name, capital: 'Paris', flagFile: null })

describe('historical statistical matching', () => {
  it('blocks split states and years before a defensible comparable period', () => {
    expect(comparableIso(entity('DEU', 'West Germany'), 1989)).toBeNull()
    expect(comparableIso(entity('DEU', 'Germany'), 1991)).toBeNull()
    expect(comparableIso(entity('SDN', 'Sudan'), 2010)).toBeNull()
    expect(comparableIso(entity('SSD', 'South Sudan'), 2012)).toBe('SSD')
    expect(comparableIso(entity('FRA'), 2000)).toBe('FRA')
  })

  it('takes only the requested UNHCR origin and exact year', () => {
    const items = { items: [
      { year: 2015, coo_iso: 'SYR', refugees: 4873236 },
      { year: 2014, coo_iso: 'SYR', refugees: 3887376 },
    ] }
    expect(parseRefugees(items, 'SYR', 2015)).toBe(4873236)
    expect(parseRefugees(items, 'SYR', 2016)).toBeNull()
    expect(parseRefugees(items, 'FRA', 2015)).toBeNull()
  })
})
