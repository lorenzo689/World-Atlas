import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Topology } from 'topojson-specification'
import { HISTORY_EVENTS } from '../historyCompare'
import {
  EVENT_ENTITIES, adjacentPeriodYears, buildEntityIndex, changeFromPrevious, compareEntity, dayToIso, eventsForEntity,
  labelAt, nameSegments, nearestLabel, nearestPresence, periodAt, periodSource, presenceRanges,
} from '../historyEntity'
import { parseEntityParam } from '../scenarios'

const topology = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/historical-topology.json'), 'utf8')) as Topology
const index = buildEntityIndex(topology)
const periods = (code: string) => {
  const list = index.get(code)
  if (!list) throw new Error(`${code} missing from the dataset`)
  return list
}

describe('entity index', () => {
  it('covers every dataset period once, sorted by start date, without decoding geometry', () => {
    const total = [...index.values()].reduce((n, list) => n + list.length, 0)
    expect(total).toBe((topology.objects.periods as { geometries: unknown[] }).geometries.length)
    for (const list of index.values()) for (let i = 1; i < list.length; i++) expect(list[i].start).toBeGreaterThan(list[i - 1].start)
  })

  it('maps 1 January snapshots to the period that the map shows', () => {
    expect(periodAt(periods('H260'), 1990)?.period).toBe(108)
    expect(periodAt(periods('H260'), 1991)?.period).toBe(109)
    expect(periodAt(periods('H260'), 1945)).toBeNull()
    expect(dayToIso(19901003)).toBe('1990-10-03')
  })
})

describe('Germany and the German division 1990/1991', () => {
  it('shows East Germany in the 1990 snapshot and not in 1991, without claiming more', () => {
    const gdr = periods('H265')
    expect(labelAt('H265', gdr, 1990)).toBe('East Germany')
    expect(periodAt(gdr, 1991)).toBeNull()
    expect(presenceRanges(gdr)).toEqual([[1946, 1990]])
    expect(nearestPresence(gdr, 1991)).toEqual({ before: 1990, after: null })
    expect(nearestLabel('H265', gdr, 1991)).toBe('East Germany')
  })

  it('compares West Germany 1990 with Germany 1991 as two dataset periods of one identifier', () => {
    const c = compareEntity('H260', periods('H260'), 1990, 1991)
    expect(c.a).toMatchObject({ date: '1990-01-01', label: 'West Germany' })
    expect(c.b).toMatchObject({ date: '1991-01-01', label: 'Germany' })
    expect(c.a.period?.capital).toBe('Bonn')
    expect(c.b.period?.capital).toBe('Berlin')
    expect(c.sharedIdentifier).toBe(true)
    expect(c.samePeriod).toBe(false)
    expect(c.geometryIdentical).toBe(false)
    const change = changeFromPrevious(periodAt(periods('H260'), 1990)!, periodAt(periods('H260'), 1991)!)
    expect(change).toMatchObject({ gapBefore: false, capitalChanged: true, geometryChanged: true, sourceNameChanged: false })
  })

  it('cannot compare geometry when one snapshot lacks the identifier', () => {
    const c = compareEntity('H265', periods('H265'), 1990, 1991)
    expect(c.b.period).toBeNull()
    expect(c.b.label).toBeNull()
    expect(c.sharedIdentifier).toBe(false)
    expect(c.geometryIdentical).toBeNull()
  })
})

describe('Soviet Union / Russia 1991/1992', () => {
  it('keeps one identifier but separate labels and periods; the comparison claims no continuity', () => {
    const russia = periods('H365')
    const c = compareEntity('H365', russia, 1991, 1992)
    expect(c.a.label).toBe('Soviet Union')
    expect(c.b.label).toBe('Russia')
    expect(c.samePeriod).toBe(false)
    // The shared identifier is reported as such, never as state continuity.
    expect(c.sharedIdentifier).toBe(true)
    expect(Object.keys(c)).not.toContain('continuity')
  })

  it('has many periods, some without any 1 January map, and reports dataset gaps', () => {
    const russia = periods('H365')
    expect(russia.length).toBeGreaterThan(20)
    expect(russia.filter((p) => p.firstYear == null).length).toBeGreaterThan(0)
    const gaps = russia.flatMap((p, i) => i > 0 && changeFromPrevious(russia[i - 1], p).gapBefore ? [[dayToIso(russia[i - 1].end), dayToIso(p.start)]] : [])
    expect(gaps).toEqual([['1940-06-01', '1940-06-04'], ['1940-06-27', '1941-01-01']])
    // The gap contains no 1 January, so every snapshot year 1886–2019 still has a period.
    expect(presenceRanges(russia)).toEqual([[1886, 2019]])
  })

  it('lists the atlas labels as segments over the snapshot years', () => {
    const labels = nameSegments('H365', periods('H365')).map((s) => s.label)
    expect(labels).toEqual(['Russian Empire', 'Russian SFSR', 'Soviet Union', 'Russia'])
    const soviet = nameSegments('H365', periods('H365')).find((s) => s.label === 'Soviet Union')!
    expect(soviet.to).toBe(1991)
  })
})

describe('navigation between dataset periods', () => {
  it('jumps to the first map of the previous and next reachable period', () => {
    expect(adjacentPeriodYears(periods('H260'), 1990)).toEqual({ previous: 1946, next: 1991 })
    expect(adjacentPeriodYears(periods('H260'), 1991)).toEqual({ previous: 1950, next: null })
    expect(adjacentPeriodYears(periods('H265'), 1991)).toEqual({ previous: 1950, next: null })
  })

  it('marks 1939–1945 periods of Germany as OHM reconstruction and flags wartime splits', () => {
    const germany = periods('H255')
    expect(periodSource('H255', periodAt(germany, 1942)!)).toBe('ohm')
    expect(periodSource('H255', periodAt(germany, 1930)!)).toBe('cshapes')
    expect(periodSource('HDANZIG', periods('HDANZIG')[0])).toBe('ohm')
    const wartime = germany.findIndex((p) => p.start === 19390101)
    expect(changeFromPrevious(germany[wartime - 1], germany[wartime]).wartimeSplit).toBe(true)
    expect(changeFromPrevious(periods('H260')[1], periods('H260')[2]).wartimeSplit).toBe(false)
  })
})

describe('curated events and deep-link values', () => {
  it('links each existing event to identifiers present in the dataset', () => {
    expect(Object.keys(EVENT_ENTITIES).sort()).toEqual(HISTORY_EVENTS.map((e) => e.id).sort())
    for (const codes of Object.values(EVENT_ENTITIES)) for (const code of codes) expect(index.has(code)).toBe(true)
    expect(eventsForEntity('H265')).toEqual(['german-unity'])
    expect(eventsForEntity('H255')).toEqual([])
  })

  it('accepts only identifier-shaped values', () => {
    expect(parseEntityParam('H265')).toBe('H265')
    expect(parseEntityParam('HDANZIG')).toBe('HDANZIG')
    for (const bad of [null, '', 'h265', '265', 'H', 'H265;x', '<script>', 'H 265', 'H1234567890123']) expect(parseEntityParam(bad)).toBeNull()
  })
})
