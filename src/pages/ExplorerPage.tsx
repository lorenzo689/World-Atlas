import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useExplorer } from '@/store/explorer'
import { useCountries } from '@/hooks/useCountries'
import { useBoundaries } from '@/hooks/useBoundaries'
import { useLatestForAll } from '@/hooks/useIndicator'
import { useDocumentMeta, useIsDesktop } from '@/hooks/useMisc'
import { INDICATORS } from '@/lib/indicators'
import { buildChoropleth } from '@/lib/color'
import { SearchBox } from '@/components/layout/SearchBox'
import { Brand } from '@/components/layout/Brand'
import { WebGLBoundary, hasWebGL } from '@/components/layout/WebGLBoundary'
import { ModeSwitcher, DataPanel } from '@/components/globe/Controls'
import { CountryPreview } from '@/components/globe/CountryPreview'
import { BottomSheet, type SheetSnap } from '@/components/globe/BottomSheet'
import { ErrorState } from '@/components/ui/feedback'

// Start fetching the (large) globe chunk immediately, in parallel with the country/boundary data,
// instead of waiting until both have loaded and the lazy component first renders.
const globeChunk = import('@/components/globe/GlobeView').then((m) => ({ default: m.GlobeView }))
const GlobeView = lazy(() => globeChunk)

const PANEL_WIDTH = 380

export default function ExplorerPage() {
  const isDesktop = useIsDesktop()
  const { byCode, status: countriesStatus, reload } = useCountries()
  const boundaries = useBoundaries()

  const mode = useExplorer((s) => s.mode)
  const metricKey = useExplorer((s) => s.metric)
  const selected = useExplorer((s) => s.selected)
  const setMode = useExplorer((s) => s.setMode)
  const setMetric = useExplorer((s) => s.setMetric)
  const select = useExplorer((s) => s.select)
  const setView = useExplorer((s) => s.setView)
  // Read once on mount: restores the camera when coming back from a country page.
  const [initialPose] = useState(() => useExplorer.getState().view)

  const [ready, setReady] = useState(false)
  const webgl = useMemo(hasWebGL, [])
  const [focusNonce, setFocusNonce] = useState(0)
  const [snap, setSnap] = useState<SheetSnap>('peek')

  useDocumentMeta({
    title: 'World Explorer — An interactive 3D atlas of every country',
    description:
      'Explore every country on an interactive 3D Earth. Real boundaries, flags, demographics and economic indicators from the World Bank.',
    path: '/',
  })

  const metric = INDICATORS[metricKey]
  const latest = useLatestForAll(metricKey, mode === 'data')
  const values = mode === 'data' && latest.status === 'success' ? latest.data : null
  const scale = useMemo(() => {
    if (!values) return null
    const nums: number[] = []
    for (const code of byCode.keys()) {
      const v = values.get(code)
      if (v) nums.push(v.value)
    }
    return buildChoropleth(nums)
  }, [values, byCode])

  const country = selected ? byCode.get(selected) : undefined
  const neighbours = useMemo(
    () => (country ? country.borders.map((b) => byCode.get(b)).filter((c): c is NonNullable<typeof c> => !!c) : []),
    [country, byCode],
  )

  const onSelect = useCallback(
    (code: string) => {
      select(code)
      setSnap('peek')
      setFocusNonce((n) => n + 1)
    },
    [select],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])

  const showPanel = !!country
  const insets = useMemo(
    () => ({
      right: showPanel && isDesktop ? PANEL_WIDTH + 32 : 0,
      bottom: showPanel && !isDesktop ? Math.round(window.innerHeight * 0.36) : 0,
    }),
    [showPanel, isDesktop],
  )

  return (
    <main className="fixed inset-0 overflow-hidden bg-background">
      <h1 className="sr-only">World Explorer — interactive 3D globe</h1>

      {/* Globe */}
      {countriesStatus === 'error' || boundaries.status === 'error' ? (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <ErrorState
            title="Couldn’t load map data"
            message="Check your connection and try again."
            onRetry={() => {
              reload()
              boundaries.retry()
            }}
          />
        </div>
      ) : (
        boundaries.status === 'success' &&
        countriesStatus === 'ready' && (
          <WebGLBoundary>
            <Suspense fallback={null}>
              <GlobeView
                boundaries={boundaries.data}
                countries={byCode}
                mode={mode}
                values={values}
                metric={metric}
                selected={selected}
                onSelect={onSelect}
                onReady={() => setReady(true)}
                onPoseChange={setView}
                initialPose={initialPose}
                insets={insets}
                focusNonce={focusNonce}
              />
            </Suspense>
          </WebGLBoundary>
        )
      )}

      {/* Vignette keeps overlay text legible against bright oceans */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(10,16,26,0.7)_100%)]"
      />

      {/* Loading veil */}
      <div
        aria-hidden={ready}
        className={`pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-background transition-opacity duration-1000 ${
          ready || !webgl || countriesStatus === 'error' || boundaries.status === 'error' ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="size-10 animate-spin rounded-full border border-primary/20 border-t-primary" />
        <p className="font-serif text-2xl text-foreground/90">World Explorer</p>
        <p className="eyebrow">Charting the globe…</p>
      </div>

      {/* Top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col gap-3 p-4 sm:p-6">
        <div className="flex items-center gap-3 sm:gap-6">
          <Brand className="pointer-events-auto shrink-0" />
          <SearchBox
            className="pointer-events-auto mx-auto w-full max-w-md"
            onSelect={(c) => onSelect(c.code)}
          />
          <div className="pointer-events-auto hidden shrink-0 md:block">
            <ModeSwitcher mode={mode} onChange={setMode} />
          </div>
        </div>
        <div className="pointer-events-auto md:hidden">
          <ModeSwitcher mode={mode} onChange={setMode} />
        </div>
      </header>

      {/* Data layer */}
      {mode === 'data' && !(showPanel && !isDesktop) && (
        <div className="absolute bottom-6 left-4 z-20 sm:left-6">
          <DataPanel
            metricKey={metricKey}
            onMetricChange={setMetric}
            meta={metric}
            status={latest.status}
            scale={scale}
            onRetry={latest.retry}
          />
        </div>
      )}

      {/* Hint */}
      {!showPanel && mode !== 'data' && ready && (
        <p className="eyebrow animate-fade pointer-events-none absolute inset-x-0 bottom-8 z-10 text-center">
          {isDesktop ? 'Drag to rotate · Scroll to zoom · Click a country' : 'Drag to rotate · Pinch to zoom · Tap a country'}
        </p>
      )}

      {/* Country preview */}
      {country &&
        (isDesktop ? (
          <aside
            key={country.code}
            aria-label={`${country.name} overview`}
            className="glass scrollbar-thin animate-rise absolute bottom-4 right-4 top-[88px] z-20 overflow-y-auto rounded-[28px]"
            style={{ width: PANEL_WIDTH }}
          >
            <CountryPreview
              country={country}
              neighbours={neighbours}
              onClose={() => select(null)}
              onSelectNeighbour={onSelect}
            />
          </aside>
        ) : (
          <BottomSheet
            snap={snap}
            onSnapChange={setSnap}
            onDismiss={() => select(null)}
            label={`${country.name} overview`}
          >
            <CountryPreview
              key={country.code}
              country={country}
              neighbours={neighbours}
              onClose={() => select(null)}
              onSelectNeighbour={onSelect}
            />
          </BottomSheet>
        ))}

      <p className="sr-only" role="status" aria-live="polite">
        {country ? `${country.name} selected` : ''}
      </p>
    </main>
  )
}
