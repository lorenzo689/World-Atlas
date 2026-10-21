import type { GlobeMode } from '@/types'

export type ScenarioId = 'today' | 'borders' | 'ww1' | 'ww2'
export interface Scenario {
  id: ScenarioId
  title: { de: string; en: string }
  firstYear: number | null
  lastYear: number | null
  modes: readonly GlobeMode[]
  capabilities: { conflicts: boolean; comparison: boolean; timeline: boolean; modernData: boolean; territories: boolean }
}

/** Product policy, shared by routing and controls. A tool never changes the active scenario. */
export const SCENARIOS: Record<ScenarioId, Scenario> = {
  today: { id: 'today', title: { de: 'Die Welt heute', en: 'The world today' }, firstYear: null, lastYear: null, modes: ['satellite', 'political', 'data'], capabilities: { conflicts: true, comparison: false, timeline: false, modernData: true, territories: true } },
  borders: { id: 'borders', title: { de: 'Grenzen im Wandel', en: 'Changing borders' }, firstYear: 1886, lastYear: 2019, modes: ['political', 'satellite'], capabilities: { conflicts: false, comparison: true, timeline: true, modernData: false, territories: true } },
  ww1: { id: 'ww1', title: { de: 'Erster Weltkrieg', en: 'World War I' }, firstYear: 1914, lastYear: 1918, modes: ['political', 'satellite'], capabilities: { conflicts: false, comparison: false, timeline: false, modernData: false, territories: true } },
  ww2: { id: 'ww2', title: { de: 'Zweiter Weltkrieg', en: 'World War II' }, firstYear: 1939, lastYear: 1945, modes: ['political', 'satellite'], capabilities: { conflicts: false, comparison: false, timeline: false, modernData: false, territories: true } },
}

export function scenarioYear(scenario: Scenario, value: number | null): number | null {
  if (scenario.firstYear == null || scenario.lastYear == null) return null
  return value != null && Number.isInteger(value) && value >= scenario.firstYear && value <= scenario.lastYear ? value : scenario.firstYear
}

export function readScenarioLink(search: string) {
  const params = new URLSearchParams(search)
  const explicit = params.get('scenario')
  // Existing shared links remain usable; an explicit scenario always wins over legacy flags.
  const id: ScenarioId = explicit && Object.hasOwn(SCENARIOS, explicit) ? explicit as ScenarioId
    : params.get('ww2') === '1' ? 'ww2' : params.get('ww1') === '1' ? 'ww1'
      : params.has('year') || params.has('compare') ? 'borders' : 'today'
  const scenario = SCENARIOS[id]
  const number = (key: string) => { const v = params.get(key); return v && /^\d{4}$/.test(v) ? Number(v) : null }
  const year = scenarioYear(scenario, number('year'))
  const compare = scenario.capabilities.comparison && number('compare') != null ? scenarioYear(scenario, number('compare')) : null
  return { scenario, year, compare }
}

export function scenarioHref(id: ScenarioId, year?: number | null): string {
  const scenario = SCENARIOS[id]
  const params = new URLSearchParams({ scenario: id })
  const bounded = scenarioYear(scenario, year ?? null)
  if (bounded != null) params.set('year', String(bounded))
  return `/explore?${params}`
}
