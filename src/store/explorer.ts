import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { GlobeMode } from '@/types'
import type { IndicatorKey } from '@/lib/indicators'
import type { Pose } from '@/lib/geo'

interface ExplorerState {
  mode: GlobeMode
  metric: IndicatorKey
  /** Country (alpha-3) shown in the preview panel, if any. */
  selected: string | null
  /** Last camera pose. Written on every camera change but not subscribed to by components. */
  view: Pose | null
  setMode: (mode: GlobeMode) => void
  setMetric: (metric: IndicatorKey) => void
  select: (code: string | null) => void
  setView: (view: Pose) => void
}

export const useExplorer = create<ExplorerState>()(
  persist(
    (set) => ({
      mode: 'satellite',
      metric: 'gdpPerCapita',
      selected: null,
      view: null,
      setMode: (mode) => set({ mode }),
      setMetric: (metric) => set({ metric }),
      select: (selected) => set({ selected }),
      setView: (view) => set({ view }),
    }),
    {
      name: 'world-explorer',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ mode: s.mode, metric: s.metric }),
    },
  ),
)
