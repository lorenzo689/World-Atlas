import { describe, expect, it } from 'vitest'
import { HISTORY_EVENTS } from '../historyCompare'
import { WW1_MOMENTS } from '../ww1'
import { WW2_MOMENTS } from '../ww2'
import { ADDITIONAL_EVENTS } from '../historicalEventsCatalog'
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
    expect(ADDITIONAL_EVENTS).toHaveLength(37)
    expect(HISTORICAL_EVENTS).toHaveLength(HISTORY_EVENTS.length + ww1.length + ww2.length + 3 + ADDITIONAL_EVENTS.length)
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
    expect(africa.map((e) => e.id)).toEqual(['el-alamein', 'libya-1951', 'sudan-1956', 'morocco-1956', 'tunisia-1956', 'ghana-1957', 'guinea-1958', 'congo-1960', 'nigeria-1960', 'south-africa-republic-1961', 'tanganyika-1961', 'algeria-1962', 'kenya-1963', 'mozambique-1975', 'angola-1975', 'zimbabwe-1980', 'namibia-1990', 'south-sudan'])
    const statehood = filterEvents(HISTORICAL_EVENTS, { ...EMPTY_FILTER, themes: ['statehood'], from: 1990, to: 1993 })
    expect(statehood.map((e) => e.id)).toEqual(['namibia-1990', 'german-unity', 'soviet-union', 'czechoslovakia'])
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

describe('global expansion: sourced additions', () => {
  // Each date was read on the cited history.state.gov page (docs/HISTORY.md, verification log).
  const VERIFIED: Record<string, [string, string]> = {
    'libya-1951': ['1951-12-24', 'countries/libya'], 'sudan-1956': ['1956-01-01', 'countries/sudan'],
    'morocco-1956': ['1956-03-02', 'countries/morocco'], 'tunisia-1956': ['1956-03-22', 'countries/tunisia'],
    'guinea-1958': ['1958-11-01', 'countries/guinea'], 'congo-1960': ['1960-06-30', 'countries/congo-democratic-republic'],
    'nigeria-1960': ['1960-10-01', 'countries/nigeria'], 'south-africa-republic-1961': ['1961-05-31', 'countries/south-africa'],
    'tanganyika-1961': ['1961-12-09', 'countries/tanzania'], 'algeria-1962': ['1962-07-03', 'countries/algeria'],
    'kenya-1963': ['1963-12-12', 'countries/kenya'], 'mozambique-1975': ['1975-06-25', 'countries/mozambique'],
    'angola-1975': ['1975-11-11', 'countries/angola'], 'zimbabwe-1980': ['1980-04-18', 'countries/zimbabwe'],
    'namibia-1990': ['1990-03-21', 'countries/namibia'],
    'philippines-1946': ['1946-07-04', 'countries/philippines'], 'burma-1948': ['1948-01-04', 'countries/burma'],
    'ceylon-1948': ['1948-02-04', 'countries/sri-lanka'], 'prc-1949': ['1949-10-01', 'milestones/1945-1952/chinese-rev'],
    'indonesia-1949': ['1949-12-28', 'countries/indonesia'], 'singapore-1965': ['1965-08-11', 'countries/singapore'],
    'saudi-arabia-1932': ['1932-09-18', 'countries/saudi-arabia'], 'jordan-1946': ['1946-05-25', 'countries/jordan'],
    'israel-1948': ['1948-05-14', 'milestones/1945-1952/creation-israel'], 'suez-1956': ['1956-10-29', 'milestones/1953-1960/suez'],
    'six-day-war-1967': ['1967-06-05', 'milestones/1961-1968/arab-israeli-war-1967'], 'camp-david-1978': ['1978-09-05', 'milestones/1977-1980/camp-david'],
    'kuwait-invasion-1990': ['1990-08-02', 'milestones/1989-1992/gulf-war'], 'oslo-1993': ['1993-09-13', 'milestones/1993-2000/oslo'],
    'spanish-american-war-1898': ['1898-04-25', 'milestones/1866-1898/spanish-american-war'], 'panama-1903': ['1903-11-03', 'milestones/1899-1913/panama-canal'],
    'jamaica-1962': ['1962-08-06', 'countries/jamaica'], 'trinidad-tobago-1962': ['1962-08-31', 'countries/trinidad-and-tobago'],
    'cuban-missile-crisis-1962': ['1962-10-28', 'milestones/1961-1968/cuban-missile-crisis'], 'chile-coup-1973': ['1973-09-11', 'milestones/1969-1976/allende'],
    'panama-canal-treaties-1977': ['1977-09-07', 'milestones/1977-1980/panama-canal'], 'belize-1981': ['1981-09-21', 'countries/belize'],
  }

  it('pins the verified date and source page of every added event', () => {
    expect(Object.keys(VERIFIED).sort()).toEqual(ADDITIONAL_EVENTS.map((e) => e.id).sort())
    for (const e of ADDITIONAL_EVENTS) {
      const [date, path] = VERIFIED[e.id]
      expect(e.date).toBe(date)
      expect(e.source.url).toBe(`https://history.state.gov/${path}`)
      expect(e.source.title).toMatch(/^U\.S\. Office of the Historian · /)
      expect(eventById(e.id)).toBe(e)
    }
  })

  it('invents no places and claims no border change', () => {
    for (const e of ADDITIONAL_EVENTS) {
      expect(e.location).toBeNull()
      expect(e.focus).toBeNull()
      expect(e.compare).toBeNull()
      expect(e.origin).toBe('catalog')
    }
    expect(eventById('six-day-war-1967')!.description.en).toMatch(/not shown as a change of state borders/)
    expect(eventById('kuwait-invasion-1990')!.description.en).toMatch(/Occupation is not shown as a change of state borders/)
  })

  it('labels recognition-dated events as recognitions, not as independence days', () => {
    const recognitions = ADDITIONAL_EVENTS.filter((e) => e.title.en.startsWith('United States recognizes'))
    expect(recognitions.map((e) => e.id).sort()).toEqual(['algeria-1962', 'burma-1948', 'ceylon-1948', 'congo-1960', 'guinea-1958', 'indonesia-1949',
      'mozambique-1975', 'namibia-1990', 'nigeria-1960', 'philippines-1946', 'singapore-1965', 'sudan-1956', 'tanganyika-1961', 'tunisia-1956', 'zimbabwe-1980'])
    for (const e of recognitions) {
      expect(e.title.de).toMatch(/^Vereinigte Staaten erkennen .+ an$/)
      expect(e.description.en).toMatch(/independence and recognition can fall on different days/)
      expect(e.description.de).toMatch(/Unabhängigkeit und Anerkennung können auf verschiedene Tage fallen/)
      expect(e.themes).toEqual(['statehood', 'diplomacy'])
    }
  })

  it('filters the new Middle East region and the politics theme', () => {
    expect(filterEvents(HISTORICAL_EVENTS, { ...EMPTY_FILTER, regions: ['middle-east'] }).map((e) => e.id))
      .toEqual(['saudi-arabia-1932', 'jordan-1946', 'israel-1948', 'suez-1956', 'six-day-war-1967', 'camp-david-1978', 'kuwait-invasion-1990', 'oslo-1993'])
    expect(filterEvents(HISTORICAL_EVENTS, { ...EMPTY_FILTER, themes: ['politics'] }).map((e) => e.id))
      .toEqual(['prc-1949', 'south-africa-republic-1961', 'chile-coup-1973'])
  })
})

describe('regional history packs', () => {
  const REGION_OF: Record<string, string> = { 'africa-independence': 'africa', 'asia-transformation': 'asia-pacific', 'middle-east': 'middle-east', 'americas-turning-points': 'americas' }

  it('has four packs, each a chronological sequence of catalog events from its region', () => {
    const packs = EVENT_TOURS.filter((t) => t.kind === 'pack')
    expect(packs.map((t) => t.id)).toEqual(Object.keys(REGION_OF))
    for (const p of packs) {
      expect(p.eventIds.length).toBeGreaterThanOrEqual(8)
      expect(new Set(p.eventIds).size).toBe(p.eventIds.length)
      const events = p.eventIds.map((id) => eventById(id)!)
      expect(events.every(Boolean)).toBe(true)
      for (const e of events) expect(e.region).toBe(REGION_OF[p.id])
      const dates = events.map((e) => e.date)
      expect([...dates].sort()).toEqual(dates)
      expect(p.description.en.length).toBeGreaterThan(40)
      expect(p.description.de.length).toBeGreaterThan(40)
    }
    expect(tourById('africa-independence')!.eventIds[0]).toBe('libya-1951')
    expect(tourById('africa-independence')!.eventIds.at(-1)).toBe('south-sudan')
    expect(tourById('middle-east')!.description.en).toMatch(/never as changes of state borders/)
  })

  it('states in each pack introduction how many steps are dated by U.S. recognition', () => {
    for (const p of EVENT_TOURS.filter((t) => t.kind === 'pack')) {
      const recognized = p.eventIds.filter((id) => eventById(id)!.title.en.startsWith('United States recognizes')).length
      if (recognized === 0) {
        expect(p.description.en).not.toMatch(/recogni[sz]/i)
        continue
      }
      expect(p.description.en).toContain(`${recognized} of the ${p.eventIds.length} steps are dated by the United States’ recognition, not by an independence day`)
      expect(p.description.de).toContain(`${recognized} der ${p.eventIds.length} Schritte sind nach der Anerkennung durch die Vereinigten Staaten datiert, nicht nach einem Unabhängigkeitstag`)
    }
  })

  it('does not present French recognition of Morocco as U.S. recognition', () => {
    const morocco = eventById('morocco-1956')!
    expect(morocco.date).toBe('1956-03-02')
    expect(morocco.title.en).toBe('France recognizes Moroccan independence')
    expect(morocco.description.en).toMatch(/The United States followed on 7 March/)
  })

  it('keeps the thematic tours unchanged by the larger catalog', () => {
    expect(EVENT_TOURS.filter((t) => t.kind === 'tour').map((t) => t.id)).toEqual(['europe-ww1', 'europe-ww2', 'asia-pacific-ww2', 'statehood'])
  })
})
