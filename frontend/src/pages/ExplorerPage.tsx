import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useExplorer } from '@/store/explorer'
import { useCountries } from '@/hooks/useCountries'
import { prefetchBoundaries, useBoundaries } from '@/hooks/useBoundaries'
import { useIndicatorAtYear, useLatestForAll } from '@/hooks/useIndicator'
import { useLang, useT } from '@/i18n'
import { useDocumentMeta, useIsDesktop } from '@/hooks/useMisc'
import { INDICATORS } from '@/lib/indicators'
import { buildChoropleth } from '@/lib/color'
import { SearchBox } from '@/components/layout/SearchBox'
import { Brand } from '@/components/layout/Brand'
import { UserMenu } from '@/components/layout/UserMenu'
import { SaveViewButton } from '@/components/globe/SaveViewButton'
import { WebGLBoundary, hasWebGL } from '@/components/layout/WebGLBoundary'
import { ModeSwitcher, DataPanel } from '@/components/globe/Controls'
import { CountryPreview } from '@/components/globe/CountryPreview'
import { HistoricalPreview } from '@/components/globe/HistoricalPreview'
import { HistoricalTimeline } from '@/components/globe/HistoricalTimeline'
import { HistoricalSearchBox } from '@/components/globe/HistoricalSearchBox'
import { ConflictPanel } from '@/components/globe/ConflictPanel'
import { Ww2Panel } from '@/components/globe/Ww2Panel'
import { Ww1Panel } from '@/components/globe/Ww1Panel'
import { BottomSheet, type SheetSnap } from '@/components/globe/BottomSheet'
import { ErrorState } from '@/components/ui/feedback'
import { loadHistory, snapshotForYear, type HistoryData } from '@/lib/history'
import { changedEntities, HISTORY_EVENTS, readHistoryLink } from '@/lib/historyCompare'
import { storyForEvent, storyEvent } from '@/lib/historyStories'
import { differenceBetweenBorders } from '@/lib/historyBoundaryDiff'
import { loadAreaDifference, type AreaDifference } from '@/lib/historyAreaDiff'
import { CONFLICT_LINES, type ConflictBrief } from '@/lib/conflicts'
import { ww2Moment, type Ww2Theater } from '@/lib/ww2'
import { ww1Moment } from '@/lib/ww1'
import { useConflictBriefs } from '@/hooks/useConflictBriefs'
import type { Pose } from '@/lib/geo'
import type { GlobeMode } from '@/types'

// Boundaries + pre-triangulated geometry start loading as soon as this module is evaluated.
prefetchBoundaries()

// Start fetching the (large) globe chunk immediately, in parallel with the country/boundary data,
// instead of waiting until both have loaded and the lazy component first renders.
const globeChunk = import('@/components/globe/GlobeView').then((m) => ({ default: m.GlobeView }))
const GlobeView = lazy(() => globeChunk)

const PANEL_WIDTH = 380

const MIN_YEAR = 1990
const MAX_YEAR = new Date().getFullYear() - 1

export default function ExplorerPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const isDesktop = useIsDesktop()
  const conflictBriefs = useConflictBriefs()
  const { byCode, status: countriesStatus, reload } = useCountries()
  const boundaries = useBoundaries()

  const mode = useExplorer((s) => s.mode)
  const metricKey = useExplorer((s) => s.metric)
  const selected = useExplorer((s) => s.selected)
  const setMode = useExplorer((s) => s.setMode)
  const setMetric = useExplorer((s) => s.setMetric)
  const select = useExplorer((s) => s.select)
  const setView = useExplorer((s) => s.setView)
  useEffect(() => { if (import.meta.env.VITE_STATIC_DEMO === 'true') setMode('political') }, [setMode])
  // Read once on mount: restores the camera when coming back from a country page.
  const [initialPose] = useState(() => useExplorer.getState().view)

  // time slider (data mode): null = latest value per country
  const [year, setYear] = useState<number | null>(null)
  const [historyYear, setHistoryYear] = useState<number | null>(() => {
    const linked = readHistoryLink(window.location.search).year
    const params = new URLSearchParams(window.location.search)
    if (params.get('scenario') === 'today') return null
    return params.get('ww2') === '1'
      ? (ww2Moment(linked) ? linked : 1939)
      : params.get('ww1') === '1'
        ? (ww1Moment(linked) ? linked : 1914)
      : linked ?? (import.meta.env.VITE_STATIC_DEMO === 'true' ? 1989 : null)
  })
  const [compareYear, setCompareYear] = useState<number | null>(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('ww2') === '1' || params.get('scenario') === 'today') return null
    return readHistoryLink(window.location.search).compare ?? (import.meta.env.VITE_STATIC_DEMO === 'true' && !window.location.search ? 1991 : null)
  })
  const [historyData, setHistoryData] = useState<HistoryData | null>(null)
  const [historyError, setHistoryError] = useState(false)
  const [historyAttempt, setHistoryAttempt] = useState(0)
  const [historicalSelected, setHistoricalSelected] = useState<string | null>(null)
  const [areaDiff, setAreaDiff] = useState<AreaDifference | null>(null)
  const [areaError, setAreaError] = useState(false)
  const [activeStory, setActiveStory] = useState<string | null>(null)
  const [storyStep, setStoryStep] = useState(0)
  const [storyAnswer, setStoryAnswer] = useState(false)
  const [storyFocus, setStoryFocus] = useState<Pose | null>(null)
  const [conflictsOpen, setConflictsOpen] = useState(false)
  const [activeConflict, setActiveConflict] = useState<ConflictBrief | null>(null)
  const [ww2Open, setWw2Open] = useState(() => new URLSearchParams(window.location.search).get('ww2') === '1')
  const [ww1Open, setWw1Open] = useState(() => new URLSearchParams(window.location.search).get('ww1') === '1')
  const [selectedWw1EventId, setSelectedWw1EventId] = useState<string | null>(null)
  const [ww2Theater, setWw2Theater] = useState<Ww2Theater | 'all'>('all')
  const [ww2ShowFronts, setWw2ShowFronts] = useState(true)
  const [ww2ShowEvents, setWw2ShowEvents] = useState(true)
  const [selectedWw2EventId, setSelectedWw2EventId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [comparePose, setComparePose] = useState<Pose | null>(initialPose)
  const webgl = useMemo(hasWebGL, [])
  const [focusNonce, setFocusNonce] = useState(0)
  const [snap, setSnap] = useState<SheetSnap>('peek')

  useDocumentMeta({ title: t('explore.metaTitle'), description: t('explore.metaDescription'), path: '/explore' })

  const metric = INDICATORS[metricKey]
  const latest = useLatestForAll(metricKey, mode === 'data')
  const atYear = useIndicatorAtYear(metricKey, mode === 'data' ? year : null)
  // a year that cannot be loaded (backend down) falls back to the latest values
  const values =
    mode !== 'data'
      ? null
      : year != null && atYear.status === 'success'
        ? atYear.data
        : latest.status === 'success'
          ? latest.data
          : null
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
  useEffect(() => {
    if (historyYear == null || historyData) return
    let active = true
    loadHistory().then(
      (data) => { if (active) { setHistoryData(data); setHistoryError(false) } },
      () => { if (active) setHistoryError(true) },
    )
    return () => { active = false }
  }, [historyYear, historyData, historyAttempt])

  const history = useMemo(
    () => historyYear != null && historyData ? snapshotForYear(historyData, historyYear) : null,
    [historyYear, historyData],
  )
  const comparison = useMemo(
    () => compareYear != null && historyData ? snapshotForYear(historyData, compareYear) : null,
    [compareYear, historyData],
  )
  const changed = useMemo(() => history && comparison ? changedEntities(history, comparison) : new Set<string>(), [history, comparison])
  const borderDiff = useMemo(() => history && comparison ? differenceBetweenBorders(history, comparison) : null, [history, comparison])
  const removedLines = useMemo(() => borderDiff ? { segments: borderDiff.removed, color: '#fb7185' } : null, [borderDiff])
  const addedLines = useMemo(() => borderDiff ? { segments: borderDiff.added, color: '#5eead4' } : null, [borderDiff])
  const lostAreas = useMemo(() => areaDiff ? { mesh: areaDiff.lost, color: '#fb7185' } : null, [areaDiff])
  const gainedAreas = useMemo(() => areaDiff ? { mesh: areaDiff.gained, color: '#5eead4' } : null, [areaDiff])
  const story = activeStory ? storyForEvent(activeStory) : undefined
  const eventForStory = activeStory ? storyEvent(activeStory) : undefined
  const warMoment = ww2Open ? ww2Moment(historyYear) : null
  const firstWarMoment = ww1Open ? ww1Moment(historyYear) : null
  const warEvents = useMemo(() => warMoment?.events.filter((event) => ww2Theater === 'all' || event.theater === ww2Theater) ?? [], [warMoment, ww2Theater])
  const warLines = useMemo(() => ww2ShowFronts && warMoment ? warMoment.fronts.filter((front) => ww2Theater === 'all' || front.theater === ww2Theater).map((front) => front.line) : null, [ww2ShowFronts, warMoment, ww2Theater])
  const conflictMarkers = useMemo(() => conflictsOpen && historyYear == null ? conflictBriefs.map((brief) => ({ ...brief.location, color: brief.id === activeConflict?.id ? '#ffffff' : brief.status === 'active' ? '#fb7185' : '#fbbf24' })) : [], [conflictsOpen, historyYear, activeConflict, conflictBriefs])
  const warMarkers = useMemo(() => ww2Open && ww2ShowEvents ? warEvents.map((event) => ({ ...event.location, color: event.id === selectedWw2EventId ? '#ffffff' : '#fbbf24' })) : [], [ww2Open, ww2ShowEvents, warEvents, selectedWw2EventId])
  const firstWarMarkers = useMemo(() => firstWarMoment?.events.map((event) => ({ ...event.location, color: event.id === selectedWw1EventId ? '#ffffff' : '#fbbf24' })) ?? [], [firstWarMoment, selectedWw1EventId])
  useEffect(() => { if (warMoment) setStoryFocus(warMoment.focus) }, [warMoment])
  useEffect(() => { if (ww1Open) setStoryFocus({ lat: 50, lng: 15, altitude: 1.45 }) }, [ww1Open])
  useEffect(() => {
    setAreaDiff(null)
    setAreaError(false)
    if (!history || !comparison) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      loadAreaDifference(history, comparison, controller.signal).then(setAreaDiff, (error) => {
        if (error?.name !== 'AbortError') setAreaError(true)
      })
    }, 140)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [history, comparison])
  useEffect(() => {
    const url = new URL(window.location.href)
    if (historyYear == null) url.searchParams.delete('year')
    else url.searchParams.set('year', String(historyYear))
    if (historyYear == null || compareYear == null) url.searchParams.delete('compare')
    else url.searchParams.set('compare', String(compareYear))
    if (ww2Open && ww2Moment(historyYear)) url.searchParams.set('ww2', '1')
    else url.searchParams.delete('ww2')
    if (ww1Open && ww1Moment(historyYear)) url.searchParams.set('ww1', '1')
    else url.searchParams.delete('ww1')
    window.history.replaceState(null, '', url)
  }, [historyYear, compareYear, ww2Open, ww1Open])
  const historicalEntity = historicalSelected ? history?.entities.get(historicalSelected) : undefined
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

  const changeHistoryYear = useCallback((next: number | null) => {
    if (next !== historyYear) setSelectedWw1EventId(null)
    setHistoryYear(next)
    if (next == null || !ww2Moment(next)) { setWw2Open(false); setSelectedWw2EventId(null) }
    if (!ww1Moment(next)) { setWw1Open(false); setSelectedWw1EventId(null) }
    if (next == null) { setCompareYear(null); setActiveStory(null); setStoryFocus(null) }
    if (next == null) setHistoricalSelected(null)
    select(null)
    setSnap('peek')
    if (next != null) setMode('political')
    if (next != null) { setConflictsOpen(false); setActiveConflict(null) }
  }, [historyYear, select, setMode])

  const openWw1 = useCallback(() => {
    setHistoryYear(1914)
    setCompareYear(null)
    setActiveStory(null)
    setHistoricalSelected(null)
    setConflictsOpen(false)
    setWw2Open(false)
    setWw1Open(true)
    setSelectedWw1EventId(null)
    setMode('political')
    select(null)
  }, [setMode, select])

  const openWw2 = useCallback(() => {
    setHistoryYear(1939)
    setCompareYear(null)
    setActiveStory(null)
    setHistoricalSelected(null)
    setConflictsOpen(false)
    setWw1Open(false)
    setSelectedWw1EventId(null)
    setWw2Open(true)
    setWw2Theater('all')
    setSelectedWw2EventId(null)
    setMode('political')
    select(null)
  }, [setMode, select])

  const changeMode = useCallback((next: GlobeMode) => {
    if (next === 'data' && historyYear != null) changeHistoryYear(null)
    setMode(next)
  }, [historyYear, changeHistoryYear, setMode])

  const onGlobeSelect = useCallback((code: string) => {
    if (ww2Open || ww1Open) return
    if (historyYear != null) {
      setHistoricalSelected(code)
      setSnap('peek')
      setFocusNonce((n) => n + 1)
    } else if (conflictsOpen) {
      const brief = conflictBriefs.find((item) => item.countryCodes.includes(code))
      if (brief) { setActiveConflict(brief); setStoryFocus({ ...brief.location, altitude: 1.25 }); return }
      onSelect(code)
    } else onSelect(code)
  }, [historyYear, onSelect, conflictsOpen, conflictBriefs, ww2Open, ww1Open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) {
        select(null)
        setHistoricalSelected(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])

  const showPanel = historyYear != null ? ww2Open || ww1Open || !!historicalEntity : conflictsOpen || !!country
  const insets = useMemo(
    () => ({
      right: showPanel && isDesktop ? PANEL_WIDTH + 32 : 0,
      bottom: showPanel && !isDesktop ? Math.round(window.innerHeight * 0.36) : 0,
    }),
    [showPanel, isDesktop],
  )

  return (
    <main className="fixed inset-0 overflow-hidden bg-background">
      <h1 className="sr-only">{t('explore.h1')}</h1>

      {/* Globe */}
      {countriesStatus === 'error' || boundaries.status === 'error' ? (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <ErrorState
            title={t('explore.mapError')}
            message={t('explore.mapErrorHint')}
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
                boundaries={history?.boundaries ?? boundaries.data}
                countries={byCode}
                mode={mode}
                values={values}
                metric={metric}
                selected={historyYear != null ? historicalSelected : selected}
                onSelect={onGlobeSelect}
                historicalEntities={historyYear != null ? history?.entities : null}
                onReady={() => setReady(true)}
                onPoseChange={(pose) => { setView(pose); if (comparison) setComparePose(pose) }}
                initialPose={initialPose}
                insets={insets}
                focusNonce={focusNonce}
                changeLines={removedLines}
                changeAreas={lostAreas}
                focusPose={storyFocus}
                markers={ww1Open ? firstWarMarkers : ww2Open ? warMarkers : conflictMarkers}
                conflictLines={conflictsOpen && historyYear == null ? CONFLICT_LINES.lines : null}
                ww2Fronts={warLines}
                onMarkerSelect={(index) => {
                  if (ww1Open) { const event = firstWarMoment?.events[index]; if (event) { setSelectedWw1EventId(event.id); setStoryFocus({ ...event.location, altitude: 0.85 }) }; return }
                  if (ww2Open) { const event = warEvents[index]; if (event) { setSelectedWw2EventId(event.id); setStoryFocus({ ...event.location, altitude: 0.85 }) }; return }
                  const brief = conflictBriefs[index]; if (brief) { setActiveConflict(brief); setStoryFocus({ ...brief.location, altitude: 1.25 }) }
                }}
              />
            </Suspense>
          </WebGLBoundary>
        )
      )}

      {comparison && history && (
        <div className="absolute inset-y-0 right-0 z-[5] w-1/2 overflow-hidden border-l border-primary/60 bg-background" aria-label={`${lang === 'de' ? 'Vergleichsjahr' : 'Comparison year'} ${compareYear}`}>
          <WebGLBoundary><Suspense fallback={null}>
            <GlobeView boundaries={comparison.boundaries} countries={byCode} mode="political" values={null} metric={metric}
              selected={historicalSelected} onSelect={onGlobeSelect} historicalEntities={comparison.entities}
              onReady={() => {}} onPoseChange={() => {}} initialPose={initialPose} externalPose={comparePose} insets={{ right: 0, bottom: 0 }}
              focusNonce={focusNonce} changeLines={addedLines} changeAreas={gainedAreas} />
          </Suspense></WebGLBoundary>
          <span className="glass pointer-events-none absolute left-3 top-32 rounded-full px-3 py-1 font-serif text-lg">{compareYear}</span>
        </div>
      )}
      {comparison && history && <span className="glass pointer-events-none absolute left-4 top-32 z-10 rounded-full px-3 py-1 font-serif text-lg">{historyYear}</span>}

      {historyYear != null && !history && (
        <div className="pointer-events-none absolute inset-0 z-10 bg-background/90" aria-busy="true" />
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
        <p className="eyebrow">{t('explore.charting')}</p>
      </div>

      {/* Top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col gap-3 p-4 sm:p-6">
        <div className="flex items-center gap-3 sm:gap-6">
          <Brand className="pointer-events-auto shrink-0" />
          <Link to="/scenarios" className="pointer-events-auto hidden shrink-0 rounded-full border border-input bg-background/75 px-3 py-2 text-xs text-foreground hover:border-primary md:inline-flex">{lang === 'de' ? 'Szenarien' : 'Scenarios'}</Link>
          {historyYear != null ? (
            <HistoricalSearchBox entities={history?.entities ?? new Map()} onSelect={onGlobeSelect} className="pointer-events-auto mx-auto w-full max-w-md" />
          ) : (
            <SearchBox className="pointer-events-auto mx-auto w-full max-w-md" onSelect={(c) => onSelect(c.code)} />
          )}
          <div className="pointer-events-auto hidden shrink-0 md:block" style={{ display: import.meta.env.VITE_STATIC_DEMO === 'true' ? 'none' : undefined }}>
            <ModeSwitcher mode={mode} onChange={changeMode} />
          </div>
          <button type="button" className={`pointer-events-auto shrink-0 rounded-full border px-3 py-2 text-xs sm:text-sm ${conflictsOpen ? 'border-rose-300 bg-rose-300/20 text-rose-100' : 'border-input bg-background/75 text-foreground'}`} aria-pressed={conflictsOpen} onClick={() => { if (historyYear != null) changeHistoryYear(null); setConflictsOpen((open) => !open); setActiveConflict(null); select(null) }}>{lang === 'de' ? 'Konflikte' : 'Conflicts'}</button>
          <UserMenu className="pointer-events-auto shrink-0" />
        </div>
        <div className="pointer-events-auto md:hidden" style={{ display: import.meta.env.VITE_STATIC_DEMO === 'true' ? 'none' : undefined }}>
          <ModeSwitcher mode={mode} onChange={changeMode} />
        </div>
      </header>

      {/* Data layer */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-col gap-3 sm:bottom-6 sm:left-6" style={{ bottom: showPanel && !isDesktop ? '38vh' : undefined }}>
        {mode === 'data' && historyYear == null && !(showPanel && !isDesktop) && (
          <DataPanel
            metricKey={metricKey}
            onMetricChange={setMetric}
            meta={metric}
            status={latest.status}
            scale={scale}
            onRetry={latest.retry}
            year={year}
            onYearChange={setYear}
            minYear={MIN_YEAR}
            maxYear={MAX_YEAR}
            yearStatus={atYear.status}
          />
        )}
        <HistoricalTimeline
          year={historyYear}
          onChange={changeHistoryYear}
          loading={historyYear != null && !history && !historyError}
          error={historyError}
          onRetry={() => { setHistoryError(false); setHistoryAttempt((n) => n + 1) }}
          onReset={import.meta.env.VITE_STATIC_DEMO === 'true' ? () => { window.location.href = `${import.meta.env.BASE_URL}explore` } : undefined}
          resetLabel={lang === 'de' ? 'Demo zurücksetzen' : 'Reset demo'}
        />
        {!ww2Open && !ww1Open && <div className="flex flex-wrap gap-2"><button type="button" className="glass w-fit rounded-full border border-amber-300/50 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-300/10" onClick={openWw1}>{lang === 'de' ? 'Erster Weltkrieg · 1914–1918' : 'World War I · 1914–1918'}</button><button type="button" className="glass w-fit rounded-full border border-orange-300/50 px-3 py-1.5 text-xs text-orange-200 hover:bg-orange-300/10" onClick={openWw2}>{lang === 'de' ? 'Zweiter Weltkrieg · 1939–1945' : 'World War II · 1939–1945'}</button></div>}
        {historyYear != null && mode === 'satellite' && <p className="glass max-w-[min(31rem,calc(100vw-2rem))] rounded-xl px-3 py-2 text-[11px] text-muted-foreground" role="note">{lang === 'de' ? 'Satellitenbild: NASA, Januar 2004. Grenzen: CShapes 2.0; Reichsannexionen 1939–1945: OHM. Das Bild zeigt keine historische Landnutzung.' : 'Satellite image: NASA, January 2004. Borders: CShapes 2.0; Reich annexations 1939–1945: OHM. The image does not show historical land cover.'}</p>}
        {historyYear != null && history && !ww2Open && !ww1Open && <section className="glass max-h-[30vh] w-[min(31rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl p-3 text-xs" aria-label={lang === 'de' ? 'Historische Ereignisse und Vergleich' : 'Historical events and comparison'}>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="rounded-full border border-primary px-3 py-1 text-primary" onClick={() => setCompareYear(compareYear == null ? Math.max(1886, historyYear - 1) : null)}>{compareYear == null ? (lang === 'de' ? 'Jahre vergleichen' : 'Compare years') : (lang === 'de' ? 'Vergleich schließen' : 'Close comparison')}</button>
            <button type="button" className="rounded-full border border-input px-3 py-1" onClick={() => navigator.clipboard.writeText(window.location.href)}>{lang === 'de' ? 'Link kopieren' : 'Copy link'}</button>
            {comparison && <span className="text-amber-300">{changed.size} {lang === 'de' ? 'veränderte Staaten/Perioden' : 'changed states/periods'}</span>}
          </div>
          {compareYear != null && <label className="mt-2 block">{lang === 'de' ? 'Vergleichsjahr' : 'Comparison year'}: {compareYear}<input className="mt-1 w-full accent-amber-300" type="range" min="1886" max="2019" value={compareYear} onChange={(e) => setCompareYear(Number(e.target.value))} /></label>}
          <div className="mt-2 flex flex-wrap gap-2">{HISTORY_EVENTS.map((event) => <button key={event.id} type="button" className="rounded-xl border border-input px-2 py-1 text-left hover:border-primary" onClick={() => { changeHistoryYear(event.before); setCompareYear(event.after); setActiveStory(event.id); setStoryStep(0); setStoryAnswer(false); setStoryFocus(storyForEvent(event.id)?.focus ?? null) }} title={event.detail[lang]}>{event.date.slice(0, 4)} · {event.title[lang]}</button>)}</div>
          {story && eventForStory && <article className="mt-3 rounded-xl border border-primary/50 bg-background/80 p-3" aria-label={lang === 'de' ? 'Geführte Zeitreise' : 'Guided history lesson'}>
            <div className="flex items-center justify-between gap-2"><strong className="text-sm">{eventForStory.title[lang]}</strong><button type="button" aria-label={lang === 'de' ? 'Lernpfad schließen' : 'Close lesson'} onClick={() => setActiveStory(null)}>×</button></div>
            <p className="mt-1 text-muted-foreground">{eventForStory.date} · {storyStep + 1}/{story.steps.length}</p>
            <p className="mt-2 text-sm">{story.steps[storyStep][lang]}</p>
            <div className="mt-2 flex gap-2"><button type="button" disabled={storyStep === 0} className="rounded border border-input px-2 py-1 disabled:opacity-40" onClick={() => setStoryStep((n) => n - 1)}>{lang === 'de' ? 'Zurück' : 'Back'}</button><button type="button" disabled={storyStep === story.steps.length - 1} className="rounded border border-primary px-2 py-1 text-primary disabled:opacity-40" onClick={() => setStoryStep((n) => n + 1)}>{lang === 'de' ? 'Weiter' : 'Next'}</button></div>
            <p className="mt-3 font-medium">{story.question[lang]}</p>
            <button type="button" className="mt-1 text-primary underline" onClick={() => setStoryAnswer((shown) => !shown)}>{storyAnswer ? (lang === 'de' ? 'Antwort verbergen' : 'Hide answer') : (lang === 'de' ? 'Antwort zeigen' : 'Show answer')}</button>
            {storyAnswer && <p className="mt-1">{story.answer[lang]}</p>}
            <a className="mt-2 block text-primary underline" href={eventForStory.source} target="_blank" rel="noreferrer">{lang === 'de' ? 'Primärquelle öffnen' : 'Open primary source'} ↗</a>
          </article>}
          {borderDiff && <div className="mt-2 flex flex-wrap gap-3" aria-label={lang === 'de' ? 'Geometrische Grenzänderungen' : 'Geometric border changes'}>
            <span className="text-rose-300">● {lang === 'de' ? 'Entfallene Grenzsegmente' : 'Removed border segments'}: {borderDiff.removed.length}</span>
            <span className="text-teal-300">● {lang === 'de' ? 'Neue Grenzsegmente' : 'Added border segments'}: {borderDiff.added.length}</span>
          </div>}
          {comparison && <p className="mt-1 text-muted-foreground" role="status">{areaError
            ? (lang === 'de' ? 'Flächenvergleich fehlgeschlagen; Grenzlinien bleiben sichtbar.' : 'Area comparison failed; border lines remain visible.')
            : areaDiff
              ? (lang === 'de' ? `Schattierte Flächen zeigen reale Gebietsverluste und -gewinne bei ${areaDiff.changedStates} fortbestehenden Staaten.${areaDiff.failedStates.length ? ` ${areaDiff.failedStates.length} Geometrien konnten nicht verglichen werden.` : ''}` : `Shaded areas show actual territory lost and gained by ${areaDiff.changedStates} continuing states.${areaDiff.failedStates.length ? ` ${areaDiff.failedStates.length} geometries could not be compared.` : ''}`)
              : (lang === 'de' ? 'Flächen werden berechnet…' : 'Computing area difference…')}</p>}
          {compareYear != null && <p className="mt-2 text-muted-foreground">{lang === 'de' ? 'Farbige Linien zeigen Unterschiede der datierten Grenzgeometrie (CShapes; Reichsannexionen 1939–1945: OHM). Staatenwechsel ohne neue Grenzlinie erscheinen in der Ereignisliste. Kartenstand jeweils 1. Januar; die Verläufe sind Rekonstruktionen.' : 'Colored lines show differences in dated boundary geometry (CShapes; Reich annexations 1939–1945: OHM). State changes without a new line appear in the event list. Snapshots represent 1 January; the outlines are reconstructions.'}</p>}
          {compareYear != null && HISTORY_EVENTS.filter((event) => event.before === historyYear && event.after === compareYear).map((event) => <a key={event.id} className="mt-1 block text-primary underline" href={event.source} target="_blank" rel="noreferrer">{event.detail[lang]} · {lang === 'de' ? 'Quelle' : 'Source'} ↗</a>)}
        </section>}
      </div>

      {/* Save the current view to the personal atlas (accounts only) */}
      {ready && import.meta.env.VITE_STATIC_DEMO !== 'true' && historyYear == null && !(showPanel && !isDesktop) && (
        <div className="absolute bottom-6 right-4 z-20 sm:right-6" style={{ right: showPanel && isDesktop ? PANEL_WIDTH + 40 : undefined }}>
          <SaveViewButton />
        </div>
      )}

      {/* Hint */}
      {!showPanel && mode !== 'data' && historyYear == null && ready && (
        <p className="eyebrow animate-fade pointer-events-none absolute inset-x-0 bottom-8 z-10 text-center">
          {isDesktop ? t('explore.hintDesktop') : t('explore.hintTouch')}
        </p>
      )}

      {/* Country preview */}
      {historyYear == null && conflictsOpen && <ConflictPanel briefs={conflictBriefs} lang={lang} selected={activeConflict} onSelect={(brief) => { setActiveConflict(brief); setStoryFocus({ ...brief.location, altitude: 1.25 }); select(null) }} onClose={() => { setConflictsOpen(false); setActiveConflict(null) }} />}
      {warMoment && (isDesktop ? <aside className="glass scrollbar-thin absolute bottom-4 right-4 top-[88px] z-20 overflow-y-auto rounded-[28px]" style={{ width: PANEL_WIDTH }} aria-label={lang === 'de' ? 'Zweiter Weltkrieg' : 'World War II'}><Ww2Panel moment={warMoment} lang={lang} theater={ww2Theater} onTheaterChange={setWw2Theater} showFronts={ww2ShowFronts} onShowFrontsChange={setWw2ShowFronts} showEvents={ww2ShowEvents} onShowEventsChange={setWw2ShowEvents} onYearChange={changeHistoryYear} onFocus={(lat, lng) => setStoryFocus({ lat, lng, altitude: 0.85 })} selectedEventId={selectedWw2EventId} onClose={() => { setWw2Open(false); setStoryFocus(null) }} /></aside> : <BottomSheet snap={snap} onSnapChange={setSnap} onDismiss={() => setWw2Open(false)} label={lang === 'de' ? 'Zweiter Weltkrieg' : 'World War II'}><Ww2Panel moment={warMoment} lang={lang} theater={ww2Theater} onTheaterChange={setWw2Theater} showFronts={ww2ShowFronts} onShowFrontsChange={setWw2ShowFronts} showEvents={ww2ShowEvents} onShowEventsChange={setWw2ShowEvents} onYearChange={changeHistoryYear} onFocus={(lat, lng) => setStoryFocus({ lat, lng, altitude: 0.85 })} selectedEventId={selectedWw2EventId} onClose={() => setWw2Open(false)} /></BottomSheet>)}
      {firstWarMoment && (isDesktop ? <aside className="glass scrollbar-thin absolute bottom-4 right-4 top-[88px] z-20 overflow-y-auto rounded-[28px]" style={{ width: PANEL_WIDTH }} aria-label={lang === 'de' ? 'Erster Weltkrieg' : 'World War I'}><Ww1Panel moment={firstWarMoment} lang={lang} selectedEventId={selectedWw1EventId} onYearChange={changeHistoryYear} onFocus={(lat, lng) => setStoryFocus({ lat, lng, altitude: 0.85 })} onClose={() => { setWw1Open(false); setStoryFocus(null) }} /></aside> : <BottomSheet snap={snap} onSnapChange={setSnap} onDismiss={() => setWw1Open(false)} label={lang === 'de' ? 'Erster Weltkrieg' : 'World War I'}><Ww1Panel moment={firstWarMoment} lang={lang} selectedEventId={selectedWw1EventId} onYearChange={changeHistoryYear} onFocus={(lat, lng) => setStoryFocus({ lat, lng, altitude: 0.85 })} onClose={() => setWw1Open(false)} /></BottomSheet>)}
      {historyYear != null && historicalEntity && history && !ww2Open && !ww1Open &&
        (isDesktop ? (
          <aside key={historicalEntity.code} aria-label={historicalEntity.name} className="glass scrollbar-thin animate-rise absolute bottom-4 right-4 top-[88px] z-20 overflow-y-auto rounded-[28px]" style={{ width: PANEL_WIDTH }}>
            <HistoricalPreview entity={historicalEntity} year={historyYear} onClose={() => setHistoricalSelected(null)} />
          </aside>
        ) : (
          <BottomSheet snap={snap} onSnapChange={setSnap} onDismiss={() => setHistoricalSelected(null)} label={historicalEntity.name}>
            <HistoricalPreview entity={historicalEntity} year={historyYear} onClose={() => setHistoricalSelected(null)} />
          </BottomSheet>
        ))}
      {historyYear == null && country && !conflictsOpen &&
        (isDesktop ? (
          <aside
            key={country.code}
            aria-label={t('explore.overview', { name: country.name })}
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
            label={t('explore.overview', { name: country.name })}
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
        {historicalEntity ? t('explore.selected', { name: historicalEntity.name }) : country ? t('explore.selected', { name: country.name }) : ''}
      </p>
    </main>
  )
}
