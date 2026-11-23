import { describe, expect, it } from 'vitest'
import { FIRST_HISTORICAL_YEAR, LAST_HISTORICAL_YEAR } from '../history'
import { HISTORY_EVENTS } from '../historyCompare'
import { HISTORY_STORIES } from '../historyStories'
import {
  PLAYBACK_SPEEDS, clampHistoricalYear, eventDates, formatHistoricalDate, nextPlaybackYear,
  parseHistoricalYear, playbackDelay, snapshotDate, timelinePosition,
} from '../timeMachine'

describe('time machine playback', () => {
  it('offers 0.5×, 1× and 2× and scales the step delay', () => {
    expect(PLAYBACK_SPEEDS).toEqual([0.5, 1, 2])
    expect(playbackDelay(1)).toBe(850)
    expect(playbackDelay(0.5)).toBe(1700)
    expect(playbackDelay(2)).toBe(425)
  })

  it('steps one dated snapshot at a time and stops at the end of the range', () => {
    expect(nextPlaybackYear(FIRST_HISTORICAL_YEAR)).toBe(FIRST_HISTORICAL_YEAR + 1)
    expect(nextPlaybackYear(LAST_HISTORICAL_YEAR - 1)).toBe(LAST_HISTORICAL_YEAR)
    expect(nextPlaybackYear(LAST_HISTORICAL_YEAR)).toBeNull()
  })

  it('clamps stepping to the available range', () => {
    expect(clampHistoricalYear(FIRST_HISTORICAL_YEAR - 1)).toBe(FIRST_HISTORICAL_YEAR)
    expect(clampHistoricalYear(LAST_HISTORICAL_YEAR + 1)).toBe(LAST_HISTORICAL_YEAR)
    expect(clampHistoricalYear(1950)).toBe(1950)
  })

  it('accepts only whole years with a snapshot as typed input', () => {
    expect(parseHistoricalYear('1950')).toBe(1950)
    expect(parseHistoricalYear(' 2019 ')).toBe(2019)
    for (const bad of ['1885', '2020', '19', '1950.5', '-1950', 'abc', '', '1e3']) expect(parseHistoricalYear(bad)).toBeNull()
  })
})

describe('time machine events', () => {
  it('uses 1 January as map date', () => {
    expect(snapshotDate(1989)).toBe('1989-01-01')
  })

  it('places events by their actual date inside the track', () => {
    const positions = HISTORY_EVENTS.map((event) => timelinePosition(event.date))
    for (const p of positions) expect(p).toBeGreaterThan(0)
    for (const p of positions) expect(p).toBeLessThan(100)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(timelinePosition(`${FIRST_HISTORICAL_YEAR}-01-01`)).toBe(0)
    expect(timelinePosition(`${LAST_HISTORICAL_YEAR}-01-01`)).toBe(100)
    // 3 October 1990 lies after 1 January 1990, not on it.
    expect(timelinePosition('1990-10-03')).toBeGreaterThan(timelinePosition('1990-01-01'))
  })

  it('keeps event date and map snapshots apart and in order for every existing event', () => {
    for (const event of HISTORY_EVENTS) {
      const dates = eventDates(event)
      expect(dates.event).toBe(event.date)
      expect(dates.before < dates.event).toBe(true)
      expect(dates.event <= dates.after).toBe(true)
      expect(event.before).toBeGreaterThanOrEqual(FIRST_HISTORICAL_YEAR)
      expect(event.after).toBeLessThanOrEqual(LAST_HISTORICAL_YEAR)
    }
    const german = eventDates(HISTORY_EVENTS.find((event) => event.id === 'german-unity')!)
    expect(german).toEqual({ event: '1990-10-03', before: '1989-01-01', after: '1991-01-01' })
  })

  it('has a guided story with a camera focus for every event', () => {
    expect(HISTORY_STORIES.map((story) => story.id).sort()).toEqual(HISTORY_EVENTS.map((event) => event.id).sort())
  })

  it('formats dates in both languages without time-zone shifts', () => {
    expect(formatHistoricalDate('1990-10-03', 'en')).toBe('3 October 1990')
    expect(formatHistoricalDate('1990-10-03', 'de')).toBe('3. Oktober 1990')
    expect(formatHistoricalDate('1993-01-01', 'en')).toBe('1 January 1993')
  })
})
