import { describe, expect, it } from 'vitest'
import { HISTORY_EVENTS } from '../historyCompare'
import { WW1_MOMENTS } from '../ww1'
import { WW2_MOMENTS } from '../ww2'
import {
  EMPTY_FILTER, EVENT_TOURS, HISTORICAL_EVENTS, REGIONS, THEMES, eventById, filterEvents, mapRelation,
  mapYearForEvent, mergeEvents, snapshotYears, tourById, type HistoricalEvent,
} from '../historicalEvents'

const ww1 = WW1_MOMENTS.flatMap((m) => m.events)
const ww2 = WW2_MOMENTS.flatMap((m) => m.events)

describe('unified event catalog', () => {
  it('contains every existing event once, with unique URL-safe ids, sorted by date', () => {
    const ids = HISTORICAL_EVENTS.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of [...HISTORY_EVENTS.map((e) => e.id), ...ww1.map((e) => e.id), ...ww2.map((e) => e.id)]) expect(ids).toContain(id)
    expect(HISTORICAL_EVENTS).toHaveLength(HISTORY_EVENTS.length + ww1.length + ww2.length + 3)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,40}$/)
    const dates = HISTORICAL_EVENTS.map((e) => e.date)
    expect([...dates].sort()).toEqual(dates)
  })

  it('keeps exact dates, both languages, a source and a known region and theme for every event', () => {
    for (const e of HISTORICAL_EVENTS) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(e.date))).toBe(false)
      expect(e.title.de && e.title.en && e.description.de && e.description.en).toBeTruthy()
      expect(e.source.url).toMatch(/^https:\/\//)
      expect(e.source.title).toBeTruthy()
      expect(REGIONS).toContain(e.region)
      expect(e.themes.length).toBeGreaterThan(0)
      for (const t of e.themes) expect(THEMES).toContain(t)
    }
  })

  it('copies dates and places from the source catalogs unchanged and invents no positions', () => {
    for (const source of [...ww1, ...ww2]) {
      const e = eventById(source.id)!
      expect(e.date).toBe(source.date)
      expect(e.location).toEqual(source.location)
    }
    for (const source of HISTORY_EVENTS) {
      const e = eventById(source.id)!
      expect(e.date).toBe(source.date)
      expect(e.location).toBeNull() // the lessons have a camera focus, not a documented place
      expect(e.compare).toEqual({ before: source.before, after: source.after })
      expect(e.storyId).toBe(source.id)
    }
    for (const id of ['india-pakistan-1947', 'ghana-1957', 'san-francisco-treaty-1951']) {
      expect(eventById(id)?.location).toBeNull()
      expect(eventById(id)?.compare).toBeNull()
    }
  })

  it('dates the added events by the milestone they name, distinct from related dates', () => {
    const india = eventById('india-pakistan-1947')!
    expect(india.date).toBe('1947-08-15') // section 1(1): Dominions set up from 15 August 1947
    expect(india.title.en).toMatch(/become independent dominions/)
    expect(india.description.en).toMatch(/Royal Assent on 18 July 1947/) // the Act's own date, named as such
    expect(india.description.de).toMatch(/18\. Juli 1947/)
    expect(india.source.url).toBe('https://www.legislation.gov.uk/ukpga/Geo6/10-11/30/enacted')
    const japan = eventById('san-francisco-treaty-1951')!
    expect(japan.date).toBe('1951-09-08')
    expect(japan.title.en).toMatch(/signed$/)
    expect(japan.description.en).toMatch(/marks the signature, not the treaty’s later entry into force/)
    expect(japan.description.de).toMatch(/nicht das spätere Inkrafttreten/)
    const ghana = eventById('ghana-1957')!
    expect(ghana.date).toBe('1957-03-06')
    expect(ghana.description.en).toMatch(/6 March 1957/)
    expect(ghana.source.url).toBe('https://www.bog.gov.gh/holidays_calendar/independence-day/')
    for (const e of [india, japan, ghana]) expect(e.location).toBeNull()
  })

  it('has events from every region', () => {
    for (const region of REGIONS) expect(HISTORICAL_EVENTS.some((e) => e.region === region)).toBe(true)
  })

  it('drops duplicates by id and by date and title when merging', () => {
    const a = eventById('barbarossa')!
    const copy: HistoricalEvent = { ...a, id: 'barbarossa-copy' }
    const same: HistoricalEvent = { ...eventById('normandy')!, title: { ...a.title } }
    const merged = mergeEvents([a], [a, copy], [{ ...same, date: a.date }])
    expect(merged.map((e) => e.id)).toEqual(['barbarossa'])
  })

  it('rejects unknown ids', () => {
    for (const bad of [null, undefined, '', 'nope', '__proto__', 'constructor']) expect(eventById(bad)).toBeNull()
  })
})

describe('filtering, search and sorting', () => {
  it('filters by region, theme and period and keeps chronological order', () => {
    const africa = filterEvents(HISTORICAL_EVENTS, { ...EMPTY_FILTER, regions: ['africa'] })
    expect(africa.map((e) => e.id)).toEqual(['el-alamein', 'ghana-1957', 'south-sudan'])
    const statehood = filterEvents(HISTORICAL_EVENTS, { ...EMPTY_FILTER, themes: ['statehood'], from: 1990, to: 1993 })
    expect(statehood.map((e) => e.id)).toEqual(['german-unity', 'soviet-union', 'czechoslovakia'])
    expect(filterEvents(HISTORICAL_EVENTS, { ...EMPTY_FILTER, from: 1914, to: 1918 }).every((e) => e.origin === 'ww1')).toBe(true)
  })

  it('searches titles and descriptions in both languages, case-insensitively', () => {
    expect(filterEvents(HISTORICAL_EVENTS, { ...EMPTY_FILTER, query: 'pearl' }).map((e) => e.id)).toEqual(['pearl-harbor'])
    expect(filterEvents(HISTORICAL_EVENTS, { ...EMPTY_FILTER, query: 'WIEDERVEREINIGUNG' }).map((e) => e.id)).toEqual(['german-unity'])
    expect(filterEvents(HISTORICAL_EVENTS, { ...EMPTY_FILTER, query: 'Gold Coast' }).map((e) => e.id)).toEqual(['ghana-1957'])
    expect(filterEvents(HISTORICAL_EVENTS, { ...EMPTY_FILTER, query: 'zzzz' })).toEqual([])
  })
})

describe('event date versus map date', () => {
  it('opens the first 1 January map after the event; the map of the same year predates it', () => {
    const barbarossa = eventById('barbarossa')!
    expect(snapshotYears(barbarossa)).toEqual({ before: 1941, after: 1942 })
    expect(mapYearForEvent(barbarossa)).toBe(1942)
    expect(mapRelation(barbarossa, 1941)).toEqual({ mapDate: '1941-01-01', relation: 'before', days: 172 })
    expect(mapRelation(barbarossa, 1942)).toMatchObject({ relation: 'after', days: 193 })
  })

  it('uses the curated lesson years and treats a 1 January event as visible that day', () => {
    expect(snapshotYears(eventById('german-unity')!)).toEqual({ before: 1989, after: 1991 })
    const czech = eventById('czechoslovakia')!
    expect(mapRelation(czech, 1993)).toMatchObject({ relation: 'same-day', days: 0 })
    const generic = { ...eventById('ghana-1957')!, date: '1957-01-01' }
    expect(snapshotYears(generic)).toEqual({ before: 1956, after: 1957 })
  })

  it('falls back to the nearest allowed map when no later snapshot exists', () => {
    const late = { ...eventById('ghana-1957')!, date: '2019-06-01' }
    expect(snapshotYears(late)).toEqual({ before: 2019, after: null })
    expect(mapYearForEvent(late)).toBe(2019)
    expect(mapRelation(late, 2019).relation).toBe('before')
  })
})

describe('curated tours', () => {
  it('contain only catalog events, in chronological order, with at least two steps', () => {
    for (const t of EVENT_TOURS) {
      expect(t.eventIds.length).toBeGreaterThanOrEqual(2)
      const events = t.eventIds.map((id) => eventById(id))
      expect(events.every(Boolean)).toBe(true)
      const dates = events.map((e) => e!.date)
      expect([...dates].sort()).toEqual(dates)
    }
    expect(tourById('europe-ww1')!.eventIds).toEqual(['sarajevo', 'tannenberg', 'gallipoli', 'lusitania', 'verdun', 'somme', 'armistice'])
    expect(tourById('europe-ww2')!.eventIds).toEqual(['poland-invasion', 'fall-france', 'barbarossa', 'stalingrad', 'italy-1943', 'normandy', 'bergen-belsen-1945', 'berlin-1945'])
    expect(tourById('asia-pacific-ww2')!.eventIds).toEqual(['pearl-harbor', 'midway', 'okinawa-1945', 'san-francisco-treaty-1951'])
    expect(tourById('statehood')!.eventIds).toEqual(['india-pakistan-1947', 'ghana-1957', 'german-unity', 'soviet-union', 'czechoslovakia', 'south-sudan'])
    expect(tourById('nope')).toBeNull()
  })
})
