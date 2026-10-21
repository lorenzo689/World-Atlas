import { useEffect, useState } from 'react'
import { loadTerritories, prepareTerritories, territorySnapshot, type TerritoryArea, type TerritorySnapshot } from '@/lib/territories'
import type { ScenarioId } from '@/lib/scenarios'

export function useTerritories(scenario: ScenarioId, year: number | null, enabled: boolean, attempt = 0) {
  const key = `${scenario}:${year}:${attempt}`
  const [state, setState] = useState<{ key: string; status: 'loading' | 'ready' | 'error'; snapshot: TerritorySnapshot | null; areas: TerritoryArea[] }>({ key: '', status: 'loading', snapshot: null, areas: [] })
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    setState({ key, status: 'loading', snapshot: null, areas: [] })
    loadTerritories(scenario).then(async (data) => {
      const snapshot = territorySnapshot(data, scenario, year)
      const areas = snapshot ? await prepareTerritories(snapshot, controller.signal) : []
      if (!controller.signal.aborted) setState({ key, status: 'ready', snapshot, areas })
    }).catch((error) => {
      if (!controller.signal.aborted && error?.name !== 'AbortError') setState({ key, status: 'error', snapshot: null, areas: [] })
    })
    return () => controller.abort()
  }, [scenario, year, enabled, key])
  // Suppress old geometry in the render preceding the effect of a year/scenario change.
  return enabled && state.key === key ? state : { key, status: 'loading' as const, snapshot: null, areas: [] }
}
