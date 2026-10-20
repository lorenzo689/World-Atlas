import { describe, expect, it } from 'vitest'
import { WW2_MOMENTS, ww2Moment } from '../ww2'

describe('World War II learning atlas', () => {
  it('has exactly one explicit snapshot for every war year', () => {
    expect(WW2_MOMENTS.map((moment) => moment.year)).toEqual([1939, 1940, 1941, 1942, 1943, 1944, 1945])
    for (const moment of WW2_MOMENTS) {
      expect(moment.date.startsWith(String(moment.year))).toBe(true)
      expect(moment.fronts.length).toBeGreaterThan(0)
      expect(moment.events.length).toBeGreaterThan(0)
      expect(moment.question.de && moment.answer.de && moment.people.de).toBeTruthy()
      expect(moment.peopleSource.url).toMatch(/^https:\/\//)
      expect(ww2Moment(moment.year)).toBe(moment)
    }
    expect(ww2Moment(1946)).toBeNull()
  })

  it('requires dates, sources, coarse precision and valid coordinates for each front', () => {
    for (const moment of WW2_MOMENTS) for (const front of moment.fronts) {
      expect(front.date).toBe(moment.date)
      expect(front.precision).toBe('schematic')
      expect(front.source.url).toMatch(/^https:\/\//)
      expect(front.line.length).toBeGreaterThanOrEqual(2)
      for (const [lng, lat] of front.line) {
        expect(lng).toBeGreaterThanOrEqual(-180)
        expect(lng).toBeLessThanOrEqual(180)
        expect(lat).toBeGreaterThanOrEqual(-90)
        expect(lat).toBeLessThanOrEqual(90)
      }
    }
  })

  it('distinguishes event dates from the map snapshot', () => {
    const moment = ww2Moment(1941)!
    expect(moment.events.some((event) => event.date > moment.date)).toBe(true)
    for (const item of WW2_MOMENTS) for (const event of item.events) {
      expect(event.source.url).toMatch(/^https:\/\//)
      expect(event.date.startsWith(String(item.year))).toBe(true)
    }
  })
})
