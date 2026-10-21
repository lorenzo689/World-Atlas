import { describe, expect, it } from 'vitest'
import { readScenarioLink, SCENARIOS, scenarioHref, scenarioYear } from '../scenarios'

describe('scenario boundaries', () => {
  it('honors explicit today even when legacy war, year and comparison parameters are present', () => {
    const result = readScenarioLink('?scenario=today&ww2=1&year=1942&compare=1914')
    expect(result.scenario.id).toBe('today')
    expect(result.year).toBeNull()
    expect(result.compare).toBeNull()
  })
  it('bounds war years and disallows cross-scenario comparison', () => {
    expect(readScenarioLink('?scenario=ww1&year=1942&compare=1916')).toMatchObject({ year: 1914, compare: null })
    expect(readScenarioLink('?scenario=ww2&year=1945&compare=1944')).toMatchObject({ year: 1945, compare: null })
    expect(scenarioYear(SCENARIOS.ww2, null)).toBe(1939)
  })
  it('preserves legacy links and rejects inherited property names and malformed years', () => {
    expect(readScenarioLink('?ww2=1&year=1941').scenario.id).toBe('ww2')
    expect(readScenarioLink('?year=1991&compare=1989')).toMatchObject({ year: 1991, compare: 1989 })
    expect(readScenarioLink('?scenario=__proto__&year=1942abc').scenario.id).toBe('borders')
    expect(readScenarioLink('?scenario=constructor').scenario.id).toBe('today')
  })
  it('uses canonical links with only valid capabilities', () => {
    for (const scenario of Object.values(SCENARIOS)) {
      expect(readScenarioLink(scenarioHref(scenario.id).split('?')[1]).scenario.id).toBe(scenario.id)
      expect(scenario.modes.includes('data')).toBe(scenario.capabilities.modernData)
    }
  })
})
