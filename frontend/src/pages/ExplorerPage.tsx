import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import { loadHistory, snapshotForDate, snapshotForYear, type HistoryData } from '@/lib/history'
import { changedEntities, HISTORY_EVENTS } from '@/lib/historyCompare'
import { storyForEvent, storyEvent } from '@/lib/historyStories'
import { eventDates, formatHistoricalDate } from '@/lib/timeMachine'
import { buildEntityIndex, nearestLabel } from '@/lib/historyEntity'
import { EMPTY_FILTER, HISTORICAL_EVENTS, eventById, filterEvents, mapYearForEvent, tourById, type EventFilter } from '@/lib/historicalEvents'
import { EventExplorer, type TourState } from '@/components/globe/EventExplorer'
import { differenceBetweenBorders } from '@/lib/historyBoundaryDiff'
import { loadAreaDifference, type AreaDifference } from '@/lib/historyAreaDiff'
import { CONFLICT_LINES, type ConflictBrief } from '@/lib/conflicts'
import { ww2Moment, type Ww2Theater } from '@/lib/ww2'
import { ww1Moment } from '@/lib/ww1'
import { useConflictBriefs } from '@/hooks/useConflictBriefs'
import type { Pose } from '@/lib/geo'
import type { GlobeMode } from '@/types'
import { readScenarioLink, scenarioYear } from '@/lib/scenarios'
import { isCameraResetShortcut } from '@/lib/shortcuts'
import { useTerritories } from '@/hooks/useTerritories'
import { TerritoryPanel } from '@/components/globe/TerritoryPanel'

// Boundaries + pre-triangulated geometry start loading as soon as this module is evaluated.
prefetchBoundaries()

// Start fetching the (large) globe chunk immediately, in parallel with the country/boundary data,
// instead of waiting until both have loaded and the lazy component first renders.
// Dwell time of a guided time-travel step before the next one is scheduled.
const TOUR_STEP_MS = 7000
const globeChunk = import('@/components/globe/GlobeView').then((m) => ({ default: m.GlobeView }))
const GlobeView = lazy(() => globeChunk)

const PANEL_WIDTH = 380

const MIN_YEAR = 1990
const MAX_YEAR = new Date().getFullYear() - 1

export default function ExplorerPage() {
  const navigate = useNavigate()
  const [entry] = useState(() => readScenarioLink(window.location.search))
  const { scenario } = entry
  const t = useT()
  const lang = useLang((s) => s.lang)
  const isDesktop = useIsDesktop()
  const conflictBriefs = useConflictBriefs(scenario.capabilities.conflicts)
  const { byCode, status: countriesStatus, reload } = useCountries()
  const boundaries = useBoundaries()

  const storedMode = useExplorer((s) => s.mode)
  const mode = scenario.modes.includes(storedMode) ? storedMode : 'political'
  const metricKey = useExplorer((s) => s.metric)
  const selected = useExplorer((s) => s.selected)
  const setMode = useExplorer((s) => s.setMode)
  const setMetric = useExplorer((s) => s.setMetric)
  const select = useExplorer((s) => s.select)
  const setView = useExplorer((s) => s.setView)
  useEffect(() => {
    if (scenario.id === 'today' && new URLSearchParams(window.location.search).get('restore') === '1') return
    select(null)
    setMode(scenario.id === 'today' ? 'satellite' : 'political')
  }, [scenario.id, select, setMode])
  // Read once on mount: restores the camera when coming back from a country page.
  const [initialPose] = useState(() => useExplorer.getState().view)

  // time slider (data mode): null = latest value per country
  const [year, setYear] = useState<number | null>(null)
  const [historyYear, setHistoryYear] = useState<number | null>(entry.year)
  const [compareYear, setCompareYear] = useState<number | null>(entry.compare)
  const [ww2Theater, setWw2Theater] = useState<Ww2Theater | 'all'>('all')
  const [territoriesEnabled, setTerritoriesEnabled] = useState(scenario.id !== 'borders')
  const [hiddenActors, setHiddenActors] = useState<Set<string>>(() => new Set())
  const [territoryAttempt, setTerritoryAttempt] = useState(0)
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(null)
  useEffect(() => setSelectedTerritoryId(null), [historyYear, compareYear, ww2Theater])
  const territories = useTerritories(scenario.id, historyYear, territoriesEnabled, territoryAttempt)
  const comparisonTerritories = useTerritories(scenario.id, compareYear, territoriesEnabled && compareYear != null, territoryAttempt)
  const territoryDisplay = useMemo(() => {
    const snapshot = territories.snapshot
    if (!snapshot || scenario.id !== 'ww2' || ww2Theater === 'all' || ww2Theater === 'europe') return snapshot
    return { ...snapshot, features: [], coverage: { de: 'Für diesen Kriegsschauplatz liegen noch keine belegten Gebietsflächen vor. Der aktuelle Datensatz deckt ausgewählte europäische Räume ab.', en: 'No sourced territory areas are available for this theater. The current dataset covers selected European regions.' } }
  }, [territories.snapshot, scenario.id, ww2Theater])
  const visibleTerritories = useMemo(() => new Set(territoryDisplay?.features.filter((feature) => !hiddenActors.has(feature.actorId)).map((feature) => feature.id) ?? []), [territoryDisplay, hiddenActors])
  const visibleComparisonTerritories = useMemo(() => new Set(comparisonTerritories.snapshot?.features.filter((feature) => !hiddenActors.has(feature.actorId)).map((feature) => feature.id) ?? []), [comparisonTerritories.snapshot, hiddenActors])
  const toggleActor = useCallback((id: string) => setHiddenActors((previous) => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  }), [])
  const [historyData, setHistoryData] = useState<HistoryData | null>(null)
  // Historical Events Explorer (Changing borders): selection and tour come from validated deep links.
  const linkedEvent = scenario.capabilities.timeline ? eventById(entry.event) : null
  // A tour is kept only with no event or with one of its own events.
  const tourOfLink = scenario.capabilities.timeline ? tourById(entry.tour) : null
  const linkedTour = tourOfLink && (!linkedEvent || tourOfLink.eventIds.includes(linkedEvent.id)) ? tourOfLink : null
  const [eventsOpen, setEventsOpen] = useState(!!(linkedEvent || linkedTour))
  const [eventFilter, setEventFilter] = useState<EventFilter>(EMPTY_FILTER)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(linkedEvent?.id ?? (linkedTour ? linkedTour.eventIds[0] : null))
  const [tour, setTour] = useState<TourState | null>(linkedTour ? {
    id: linkedTour.id, eventIds: linkedTour.eventIds, playing: false,
    index: Math.max(0, linkedEvent ? linkedTour.eventIds.indexOf(linkedEvent.id) : 0),
  } : null)
  // The selection written to the URL (entity, event, tour). A user change of it creates a browser
  // history entry; year changes, tour steps and corrections of invalid links replace the entry.
  const selectionInUrl = useRef(`${entry.entity}|${selectedEventId}|${linkedTour?.id ?? null}`)
  const replaceNextUrl = useRef(false)
  const [historyError, setHistoryError] = useState(false)
  const [historyAttempt, setHistoryAttempt] = useState(0)
  const [historicalSelected, setHistoricalSelected] = useState<string | null>(entry.entity)
  const [areaDiff, setAreaDiff] = useState<AreaDifference | null>(null)
  const [areaError, setAreaError] = useState(false)
  const [activeStory, setActiveStory] = useState<string | null>(null)
  const [storyStep, setStoryStep] = useState(0)
  const [storyAnswer, setStoryAnswer] = useState(false)
  const [storyFocus, setStoryFocus] = useState<Pose | null>(null)
  const [conflictsOpen, setConflictsOpen] = useState(false)
  const [activeConflict, setActiveConflict] = useState<ConflictBrief | null>(null)
  const ww2Open = scenario.id === 'ww2'
  const ww1Open = scenario.id === 'ww1'
  const [selectedWw1EventId, setSelectedWw1EventId] = useState<string | null>(null)
  const [ww2ShowFronts, setWw2ShowFronts] = useState(true)
  const [ww2ShowEvents, setWw2ShowEvents] = useState(true)
  const [selectedWw2EventId, setSelectedWw2EventId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [comparePose, setComparePose] = useState<Pose | null>(null)
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

  // The WWII view shows the borders of the moment's exact date, so state borders, occupation areas
  // and fronts share one day; every other view uses 1 January of the selected year.
  const momentDate = ww2Open ? ww2Moment(historyYear)?.date : undefined
  const history = useMemo(
    () => historyYear != null && historyData ? (momentDate ? snapshotForDate(historyData, momentDate) : snapshotForYear(historyData, historyYear)) : null,
    [historyYear, historyData, momentDate],
  )
  const comparison = useMemo(
    () => compareYear != null && historyData ? snapshotForYear(historyData, compareYear) : null,
    [compareYear, historyData],
  )
  // The comparison globe follows the main camera. Poses are only forwarded while it is open, so a
  // closed comparison forgets its pose and a new one starts from the main globe's current camera.
  const comparing = comparison != null
  useEffect(() => { if (!comparing) setComparePose(null) }, [comparing])
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
    url.searchParams.set('scenario', scenario.id)
    if (historyYear == null) url.searchParams.delete('year')
    else url.searchParams.set('year', String(historyYear))
    if (historyYear == null || compareYear == null) url.searchParams.delete('compare')
    else url.searchParams.set('compare', String(compareYear))
    if (ww2Open && ww2Moment(historyYear)) url.searchParams.set('ww2', '1')
    else url.searchParams.delete('ww2')
    if (ww1Open && ww1Moment(historyYear)) url.searchParams.set('ww1', '1')
    else url.searchParams.delete('ww1')
    // Only Changing borders shares a selected historical identifier; other scenarios drop the parameter.
    const entity = scenario.capabilities.timeline && historyYear != null ? historicalSelected : null
    if (entity) url.searchParams.set('entity', entity)
    else url.searchParams.delete('entity')
    // Selecting or closing an entity is a step the browser can go back to; year changes (playback,
    // scrubbing) replace the current entry instead of flooding the history.
    const event = scenario.capabilities.timeline && historyYear != null && eventsOpen ? selectedEventId : null
    const tourId = event != null && tour && tour.id !== 'results' ? tour.id : null
    if (event) url.searchParams.set('event', event)
    else url.searchParams.delete('event')
    if (tourId) url.searchParams.set('tour', tourId)
    else url.searchParams.delete('tour')
    const key = `${entity}|${event}|${tourId}`
    const push = selectionInUrl.current !== key && !replaceNextUrl.current
    selectionInUrl.current = key
    replaceNextUrl.current = false
    if (url.href === window.location.href) return
    if (push) window.history.pushState(window.history.state, '', url)
    else window.history.replaceState(window.history.state, '', url)
  }, [historyYear, compareYear, ww2Open, ww1Open, scenario, historicalSelected, eventsOpen, selectedEventId, tour])
  useEffect(() => {
    const onPop = () => {
      const link = readScenarioLink(window.location.search)
      if (link.scenario.id !== scenario.id) return // ExplorerRoute remounts the page for another scenario
      const event = scenario.capabilities.timeline ? eventById(link.event) : null
      const tourOfLink = scenario.capabilities.timeline ? tourById(link.tour) : null
      const linked = tourOfLink && event && tourOfLink.eventIds.includes(event.id) ? tourOfLink : null
      selectionInUrl.current = `${link.entity}|${event?.id ?? null}|${event && linked ? linked.id : null}`
      replaceNextUrl.current = true
      setHistoryYear(link.year)
      setCompareYear(link.compare)
      setHistoricalSelected(link.entity)
      setEventsOpen(!!event)
      setSelectedEventId(event?.id ?? null)
      setTour(event && linked ? { id: linked.id, eventIds: linked.eventIds, playing: false, index: Math.max(0, linked.eventIds.indexOf(event.id)) } : null)
      if (event?.focus) setStoryFocus({ ...event.focus })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [scenario.id, scenario.capabilities.timeline])
  // Historical Country Explorer: per-identifier overview of the dataset periods (no geometry decoded).
  const entityIndex = useMemo(() => historyData && scenario.capabilities.timeline ? buildEntityIndex(historyData.topology) : null, [historyData, scenario])
  const entityPeriods = historicalSelected && entityIndex ? entityIndex.get(historicalSelected) ?? null : null
  useEffect(() => {
    // A deep link may name an identifier that is not in the loaded dataset: ignore it quietly.
    if (!entityIndex || !historicalSelected || entityIndex.has(historicalSelected)) return
    replaceNextUrl.current = true
    setHistoricalSelected(null)
  }, [entityIndex, historicalSelected])
  const timelineWaiting = (compareYear != null && !!history && !!comparison && !areaDiff && !areaError)
    || (territoriesEnabled && (territories.status === 'loading' || (compareYear != null && comparisonTerritories.status === 'loading')))
  const timelineBlocked = compareYear != null && areaError ? t('history.pausedCompare')
    : territoriesEnabled && (territories.status === 'error' || (compareYear != null && comparisonTerritories.status === 'error')) ? t('history.pausedLayer')
      : null
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
    next = scenarioYear(scenario, next)
    if (next !== historyYear) setSelectedWw1EventId(null)
    setHistoryYear(next)
    setSelectedWw2EventId(null)
    if (next == null) { setCompareYear(null); setActiveStory(null); setStoryFocus(null) }
    if (next == null) setHistoricalSelected(null)
    select(null)
    setSnap('peek')
    if (next != null && historyYear == null) setMode('political')
    if (next != null) { setConflictsOpen(false); setActiveConflict(null) }
  }, [historyYear, select, setMode, scenario])

  const openEvent = useCallback((id: string) => {
    const event = storyEvent(id)
    if (!event) return
    changeHistoryYear(event.before)
    setCompareYear(event.after)
    setActiveStory(id)
    setStoryStep(0)
    setStoryAnswer(false)
    const focus = storyForEvent(id)?.focus
    setStoryFocus(focus ? { ...focus } : null)
  }, [changeHistoryYear])

  // Year changes from the country explorer keep the mobile sheet where the user is reading.
  const keepSheet = useCallback((year: number) => {
    const current = snap
    changeHistoryYear(year)
    setSnap(current)
  }, [snap, changeHistoryYear])

  // ---- Historical Events Explorer --------------------------------------------------------------
  const eventResults = useMemo(() => filterEvents(HISTORICAL_EVENTS, eventFilter), [eventFilter])
  // Markers: the tour's events while touring, else the filter results; only events with a documented place.
  const markerEvents = useMemo(() => {
    if (!eventsOpen || !scenario.capabilities.timeline) return []
    const list = tour ? tour.eventIds.map((id) => eventById(id)).filter((e) => e != null) : eventResults
    return list.filter((e) => e.location != null)
  }, [eventsOpen, scenario, tour, eventResults])
  const eventMarkers = useMemo(() => markerEvents.map((e) => ({ ...e.location!, color: e.id === selectedEventId ? '#ffffff' : '#c4b5fd' })), [markerEvents, selectedEventId])
  const focusEvent = useCallback((id: string) => {
    const focus = eventById(id)?.focus
    if (focus) setStoryFocus({ ...focus })
  }, [])
  const selectEvent = useCallback((id: string | null) => {
    setSelectedEventId(id)
    if (!id) return
    focusEvent(id)
    // Selecting an event outside the running tour ends the tour; inside it, the tour pauses there.
    setTour((current) => current && current.eventIds.includes(id) ? { ...current, playing: false, index: current.eventIds.indexOf(id) } : null)
  }, [focusEvent])
  // The map year a tour step set; any other year change (Time Machine, slider) pauses the tour.
  const tourYear = useRef<number | null>(null)
  const goTourStep = useCallback((eventIds: string[], index: number, record: 'push' | 'replace') => {
    const event = eventById(eventIds[index])
    if (!event) return
    if (record === 'replace') replaceNextUrl.current = true
    setSelectedEventId(event.id)
    const year = mapYearForEvent(event)
    tourYear.current = year
    keepSheet(year)
    focusEvent(event.id)
  }, [keepSheet, focusEvent])
  const startTour = useCallback((id: string) => {
    const eventIds = id === 'results' ? eventResults.map((e) => e.id) : tourById(id)?.eventIds ?? []
    if (eventIds.length < 2) return
    setTour({ id, eventIds, index: 0, playing: true })
    goTourStep(eventIds, 0, 'push')
  }, [eventResults, goTourStep])
  const stepTour = useCallback((index: number) => {
    if (!tour || index < 0 || index >= tour.eventIds.length) return
    setTour({ ...tour, index })
    goTourStep(tour.eventIds, index, 'replace')
  }, [tour, goTourStep])
  const playTour = useCallback((playing: boolean) => {
    if (!tour) return
    // Resuming shows the current step's map again, so a year changed in between is not skipped.
    if (playing) goTourStep(tour.eventIds, tour.index, 'replace')
    setTour({ ...tour, playing })
  }, [tour, goTourStep])
  const endTour = useCallback(() => setTour(null), [])
  useEffect(() => {
    if (!tour?.playing) return
    if (historyYear !== tourYear.current) { setTour((t) => t && { ...t, playing: false }); return }
    // One pending step at most, scheduled only once the shown map and its comparison are ready.
    if (!history || timelineWaiting) return
    const timer = window.setTimeout(() => {
      if (tour.index >= tour.eventIds.length - 1) { setTour((t) => t && { ...t, playing: false }); return }
      setTour((t) => t && { ...t, index: t.index + 1 })
      goTourStep(tour.eventIds, tour.index + 1, 'replace')
    }, TOUR_STEP_MS)
    return () => window.clearTimeout(timer)
  }, [tour, historyYear, history, timelineWaiting, goTourStep])
  const closeEvents = useCallback(() => { setEventsOpen(false); setTour(null) }, [])
  // A linked event focuses the camera once the globe is ready (GlobeView applies focusPose then).
  const linkedFocus = useRef(linkedEvent?.focus ?? null)
  useEffect(() => { if (linkedFocus.current) setStoryFocus({ ...linkedFocus.current }) }, [])

  const changeMode = useCallback((next: GlobeMode) => {
    if (scenario.modes.includes(next)) setMode(next)
  }, [scenario, setMode])

  const onGlobeSelect = useCallback((code: string) => {
    if (historyYear != null) {
      setEventsOpen(false)
      setTour(null)
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

  // "R" flies the camera back to the default view; scenario, year and selection stay as they are.
  const [resetNonce, setResetNonce] = useState(0)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isCameraResetShortcut(e)) return
      e.preventDefault()
      setResetNonce((n) => n + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const eventsPanelOpen = eventsOpen && scenario.capabilities.timeline && historyYear != null
  const explorerOpen = !eventsPanelOpen && historyYear != null && !!history && !ww2Open && !ww1Open && !!historicalSelected && !!(historicalEntity || entityPeriods)
  const showPanel = historyYear != null ? ww2Open || ww1Open || explorerOpen || eventsPanelOpen : conflictsOpen || !!country
  const insets = useMemo(
    () => ({
      right: showPanel && isDesktop ? PANEL_WIDTH + 32 : 0,
      bottom: showPanel && !isDesktop ? Math.round(window.innerHeight * 0.36) : 0,
    }),
    [showPanel, isDesktop],
  )

  const explorerName = historicalEntity?.name ?? (historicalSelected && entityPeriods && historyYear != null ? nearestLabel(historicalSelected, entityPeriods, historyYear) : '')
  const explorerPreview = explorerOpen && historicalSelected && historyYear != null ? (
    <HistoricalPreview
      entity={historicalEntity ?? null}
      absentLabel={explorerName}
      year={historyYear}
      onClose={() => setHistoricalSelected(null)}
      development={entityPeriods && historyData ? {
        code: historicalSelected,
        periods: entityPeriods,
        year: historyYear,
        compareYear,
        flags: historyData.flags[historicalSelected.slice(1)] ?? [],
        areaFailed: !!areaDiff?.failedStates.includes(historicalSelected),
        onYearChange: keepSheet,
        onCompare: (next) => { if (scenario.capabilities.comparison) setCompareYear(next) },
      } : undefined}
    />
  ) : null

  const eventsLabel = lang === 'de' ? 'Historische Ereignisse' : 'Historical events'
  const eventsPanel = eventsPanelOpen && historyYear != null ? (
    <EventExplorer
      year={historyYear}
      events={HISTORICAL_EVENTS}
      results={eventResults}
      filter={eventFilter}
      onFilterChange={setEventFilter}
      selectedId={selectedEventId}
      onSelect={selectEvent}
      tour={tour}
      onTourStart={startTour}
      onTourStep={stepTour}
      onTourPlay={playTour}
      onTourEnd={endTour}
      mapError={historyError}
      onShowYear={keepSheet}
      onCompare={(before, after) => { keepSheet(before); setCompareYear(after) }}
      onOpenLesson={openEvent}
      onOpenEntity={(code) => { setEventsOpen(false); setTour(null); setHistoricalSelected(code) }}
      entityLabel={(code) => { const periods = entityIndex?.get(code); return periods ? nearestLabel(code, periods, historyYear) : code }}
      onClose={closeEvents}
    />
  ) : null

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
                neutralPolitical={ww2Open}
                onReady={() => setReady(true)}
                onPoseChange={(pose) => { setView(pose); if (comparison) setComparePose(pose) }}
                initialPose={initialPose}
                insets={insets}
                focusNonce={focusNonce}
                changeLines={removedLines}
                changeAreas={territoriesEnabled ? null : lostAreas}
                territoryAreas={territoriesEnabled ? territories.areas : undefined}
                visibleTerritories={visibleTerritories}
                territoryFeatures={territoriesEnabled ? territoryDisplay?.features : undefined}
                onTerritorySelect={setSelectedTerritoryId}
                focusPose={storyFocus}
                resetNonce={resetNonce}
                markers={ww1Open ? firstWarMarkers : ww2Open ? warMarkers : scenario.capabilities.timeline ? eventMarkers : conflictMarkers}
                conflictLines={conflictsOpen && historyYear == null ? CONFLICT_LINES.lines : null}
                ww2Fronts={warLines}
                onMarkerSelect={(index) => {
                  if (ww1Open) { const event = firstWarMoment?.events[index]; if (event) { setSelectedWw1EventId(event.id); setStoryFocus({ ...event.location, altitude: 0.85 }) }; return }
                  if (ww2Open) { const event = warEvents[index]; if (event) { setSelectedWw2EventId(event.id); setStoryFocus({ ...event.location, altitude: 0.85 }) }; return }
                  if (scenario.capabilities.timeline) { const event = markerEvents[index]; if (event) selectEvent(event.id); return }
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
              onReady={() => {}} onPoseChange={() => {}} initialPose={initialPose} externalPose={comparePose ?? useExplorer.getState().view ?? initialPose} insets={{ right: 0, bottom: 0 }}
              focusNonce={focusNonce} changeLines={addedLines} changeAreas={territoriesEnabled ? null : gainedAreas}
              territoryAreas={territoriesEnabled ? comparisonTerritories.areas : undefined} visibleTerritories={visibleComparisonTerritories}
              territoryFeatures={territoriesEnabled ? comparisonTerritories.snapshot?.features : undefined} onTerritorySelect={setSelectedTerritoryId} />
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
          <span className="hidden text-xs text-primary lg:block" data-testid="active-scenario">{scenario.title[lang]}</span>
          <Link to="/scenarios" className="pointer-events-auto shrink-0 rounded-full border border-input bg-background/75 px-3 py-2 text-xs text-foreground hover:border-primary">{lang === 'de' ? 'Szenarien' : 'Scenarios'}</Link>
          {historyYear != null ? (
            <HistoricalSearchBox entities={history?.entities ?? new Map()} onSelect={onGlobeSelect} className="pointer-events-auto mx-auto w-full max-w-md" />
          ) : (
            <SearchBox className="pointer-events-auto mx-auto w-full max-w-md" onSelect={(c) => onSelect(c.code)} />
          )}
          <div className="pointer-events-auto hidden shrink-0 md:block" style={{ display: import.meta.env.VITE_STATIC_DEMO === 'true' ? 'none' : undefined }}>
            <ModeSwitcher mode={mode} onChange={changeMode} allowedModes={scenario.modes} />
          </div>
          {scenario.capabilities.conflicts && <button type="button" className={`pointer-events-auto shrink-0 rounded-full border px-3 py-2 text-xs sm:text-sm ${conflictsOpen ? 'border-rose-300 bg-rose-300/20 text-rose-100' : 'border-input bg-background/75 text-foreground'}`} aria-pressed={conflictsOpen} onClick={() => { if (historyYear != null) changeHistoryYear(null); setConflictsOpen((open) => !open); setActiveConflict(null); select(null) }}>{lang === 'de' ? 'Konflikte' : 'Conflicts'}</button>}
          {scenario.capabilities.timeline && <button type="button" className={`pointer-events-auto shrink-0 rounded-full border px-3 py-2 text-xs sm:text-sm ${eventsOpen ? 'border-violet-300 bg-violet-300/20 text-violet-100' : 'border-input bg-background/75 text-foreground'}`} aria-pressed={eventsOpen} onClick={() => (eventsOpen ? closeEvents() : setEventsOpen(true))}>{lang === 'de' ? 'Ereignisse' : 'Events'}</button>}
          <UserMenu className="pointer-events-auto shrink-0" />
        </div>
        <p className="text-xs text-primary lg:hidden">{scenario.title[lang]}{historyYear != null ? ` ? ${historyYear}` : ` ? ${new Date().getFullYear()}`}</p>
        <div className="pointer-events-auto md:hidden" style={{ display: import.meta.env.VITE_STATIC_DEMO === 'true' ? 'none' : undefined }}>
          <ModeSwitcher mode={mode} onChange={changeMode} allowedModes={scenario.modes} />
        </div>
      </header>

      {/* Data layer */}
      <div className="scrollbar-thin absolute bottom-4 left-4 z-20 flex max-h-[calc(100dvh-150px)] flex-col gap-3 overflow-y-auto sm:bottom-6 sm:left-6" style={{ bottom: showPanel && !isDesktop ? '38vh' : undefined }}>
        {territoriesEnabled && compareYear != null && <div className="space-y-2"><p className="text-xs text-primary">{lang === 'de' ? 'Vergleichsjahr' : 'Comparison year'}: {compareYear}</p><TerritoryPanel lang={lang} enabled={territoriesEnabled} onEnabledChange={setTerritoriesEnabled} status={comparisonTerritories.status} snapshot={comparisonTerritories.snapshot} selectedTerritoryId={selectedTerritoryId} onTerritorySelect={setSelectedTerritoryId} hiddenActors={hiddenActors} onActorToggle={toggleActor} onFocus={(lat, lng) => setStoryFocus({ lat, lng, altitude: 0.9 })} onRetry={() => setTerritoryAttempt((n) => n + 1)} /></div>}
        <TerritoryPanel lang={lang} enabled={territoriesEnabled} onEnabledChange={setTerritoriesEnabled} status={territories.status} snapshot={territoryDisplay} hiddenActors={hiddenActors} onActorToggle={toggleActor} onFocus={(lat, lng) => setStoryFocus({ lat, lng, altitude: 0.9 })} onRetry={() => setTerritoryAttempt((n) => n + 1)} comparisonDate={comparisonTerritories.snapshot?.date} selectedTerritoryId={selectedTerritoryId} onTerritorySelect={setSelectedTerritoryId} />
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
        {scenario.capabilities.timeline && <HistoricalTimeline
          allowToday={false}
          year={historyYear}
          onChange={changeHistoryYear}
          loading={historyYear != null && !history && !historyError}
          error={historyError}
          onRetry={() => { setHistoryError(false); setHistoryAttempt((n) => n + 1) }}
          onReset={import.meta.env.VITE_STATIC_DEMO === 'true' ? () => { window.location.href = `${import.meta.env.BASE_URL}explore?scenario=borders&year=1886` } : undefined}
          resetLabel={lang === 'de' ? 'Demo zurücksetzen' : 'Reset demo'}
          waiting={timelineWaiting}
          blocked={timelineBlocked}
          events={HISTORY_EVENTS}
          selectedEventId={activeStory}
          onEventSelect={openEvent}
        />}
        {historyYear != null && mode === 'satellite' && <p className="glass max-w-[min(31rem,calc(100vw-2rem))] rounded-xl px-3 py-2 text-[11px] text-muted-foreground" role="note">{lang === 'de' ? 'Satellitenbild: NASA, Januar 2004. Grenzen: CShapes 2.0; Reichsannexionen 1939–1945: OHM. Das Bild zeigt keine historische Landnutzung.' : 'Satellite image: NASA, January 2004. Borders: CShapes 2.0; Reich annexations 1939–1945: OHM. The image does not show historical land cover.'}</p>}
        {historyYear != null && history && !ww2Open && !ww1Open && <section className="glass max-h-[30vh] w-[min(31rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl p-3 text-xs" aria-label={lang === 'de' ? 'Historische Ereignisse und Vergleich' : 'Historical events and comparison'}>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="rounded-full border border-primary px-3 py-1 text-primary" onClick={() => setCompareYear(compareYear == null ? Math.max(1886, historyYear - 1) : null)}>{compareYear == null ? (lang === 'de' ? 'Jahre vergleichen' : 'Compare years') : t('history.endCompare')}</button>
            <button type="button" className="rounded-full border border-input px-3 py-1" onClick={() => navigator.clipboard.writeText(window.location.href)}>{lang === 'de' ? 'Link kopieren' : 'Copy link'}</button>
            {compareYear != null && <span className="text-primary" data-testid="compare-fixed">{t('history.compareFixed', { year: compareYear })}</span>}
            {comparison && <span className="text-amber-300">{changed.size} {lang === 'de' ? 'veränderte Staaten/Perioden' : 'changed states/periods'}</span>}
          </div>
          {compareYear != null && <label className="mt-2 block">{lang === 'de' ? 'Vergleichsjahr' : 'Comparison year'}: {compareYear}<input className="mt-1 w-full accent-amber-300" type="range" min="1886" max="2019" value={compareYear} onChange={(e) => setCompareYear(Number(e.target.value))} /></label>}
          {story && eventForStory && <article className="mt-3 rounded-xl border border-primary/50 bg-background/80 p-3" aria-label={lang === 'de' ? 'Geführte Zeitreise' : 'Guided history lesson'}>
            <div className="flex items-center justify-between gap-2"><strong className="text-sm">{eventForStory.title[lang]}</strong><button type="button" aria-label={lang === 'de' ? 'Lernpfad schließen' : 'Close lesson'} onClick={() => setActiveStory(null)}>×</button></div>
            <p className="mt-1">{eventForStory.detail[lang]}</p>
            <p className="mt-1 text-muted-foreground"><time dateTime={eventForStory.date}>{t('history.eventDate', { date: formatHistoricalDate(eventForStory.date, lang) })}</time></p>
            <p className="mt-1 text-muted-foreground" data-testid="event-map-dates">{t('history.mapDates', { before: formatHistoricalDate(eventDates(eventForStory).before, lang), after: formatHistoricalDate(eventDates(eventForStory).after, lang) })}</p>
            <p className="mt-2 text-muted-foreground">{storyStep + 1}/{story.steps.length}</p>
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
      {warMoment && (isDesktop ? <aside className="glass scrollbar-thin absolute bottom-4 right-4 top-[88px] z-20 overflow-y-auto rounded-[28px]" style={{ width: PANEL_WIDTH }} aria-label={lang === 'de' ? 'Zweiter Weltkrieg' : 'World War II'}><Ww2Panel moment={warMoment} lang={lang} theater={ww2Theater} onTheaterChange={setWw2Theater} showFronts={ww2ShowFronts} onShowFrontsChange={setWw2ShowFronts} showEvents={ww2ShowEvents} onShowEventsChange={setWw2ShowEvents} onYearChange={changeHistoryYear} onFocus={(lat, lng) => setStoryFocus({ lat, lng, altitude: 0.85 })} selectedEventId={selectedWw2EventId} onClose={() => { navigate('/scenarios'); setStoryFocus(null) }} /></aside> : <BottomSheet snap={snap} onSnapChange={setSnap} onDismiss={() => navigate('/scenarios')} label={lang === 'de' ? 'Zweiter Weltkrieg' : 'World War II'}><Ww2Panel moment={warMoment} lang={lang} theater={ww2Theater} onTheaterChange={setWw2Theater} showFronts={ww2ShowFronts} onShowFrontsChange={setWw2ShowFronts} showEvents={ww2ShowEvents} onShowEventsChange={setWw2ShowEvents} onYearChange={changeHistoryYear} onFocus={(lat, lng) => setStoryFocus({ lat, lng, altitude: 0.85 })} selectedEventId={selectedWw2EventId} onClose={() => navigate('/scenarios')} /></BottomSheet>)}
      {firstWarMoment && (isDesktop ? <aside className="glass scrollbar-thin absolute bottom-4 right-4 top-[88px] z-20 overflow-y-auto rounded-[28px]" style={{ width: PANEL_WIDTH }} aria-label={lang === 'de' ? 'Erster Weltkrieg' : 'World War I'}><Ww1Panel moment={firstWarMoment} lang={lang} selectedEventId={selectedWw1EventId} onYearChange={changeHistoryYear} onFocus={(lat, lng) => setStoryFocus({ lat, lng, altitude: 0.85 })} onClose={() => { navigate('/scenarios'); setStoryFocus(null) }} /></aside> : <BottomSheet snap={snap} onSnapChange={setSnap} onDismiss={() => navigate('/scenarios')} label={lang === 'de' ? 'Erster Weltkrieg' : 'World War I'}><Ww1Panel moment={firstWarMoment} lang={lang} selectedEventId={selectedWw1EventId} onYearChange={changeHistoryYear} onFocus={(lat, lng) => setStoryFocus({ lat, lng, altitude: 0.85 })} onClose={() => navigate('/scenarios')} /></BottomSheet>)}
      {eventsPanelOpen && historyYear != null &&
        (isDesktop ? (
          <aside aria-label={eventsLabel} className="glass scrollbar-thin animate-rise absolute bottom-4 right-4 top-[88px] z-20 overflow-y-auto rounded-[28px]" style={{ width: PANEL_WIDTH }}>
            {eventsPanel}
          </aside>
        ) : (
          <BottomSheet snap={snap} onSnapChange={setSnap} onDismiss={closeEvents} label={eventsLabel}>
            {eventsPanel}
          </BottomSheet>
        ))}
      {explorerOpen && historicalSelected &&
        (isDesktop ? (
          <aside key={historicalSelected} aria-label={explorerName} className="glass scrollbar-thin animate-rise absolute bottom-4 right-4 top-[88px] z-20 overflow-y-auto rounded-[28px]" style={{ width: PANEL_WIDTH }}>
            {explorerPreview}
          </aside>
        ) : (
          <BottomSheet snap={snap} onSnapChange={setSnap} onDismiss={() => setHistoricalSelected(null)} label={explorerName}>
            {explorerPreview}
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
