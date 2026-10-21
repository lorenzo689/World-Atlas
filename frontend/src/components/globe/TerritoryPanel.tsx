import { useEffect, useRef } from 'react'
import type { TerritorySnapshot } from '@/lib/territories'

interface Props {
  lang: 'de' | 'en'
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  status: 'loading' | 'ready' | 'error'
  snapshot: TerritorySnapshot | null
  hiddenActors: ReadonlySet<string>
  onActorToggle: (id: string) => void
  onFocus: (lat: number, lng: number) => void
  onRetry: () => void
  comparisonDate?: string
  selectedTerritoryId?: string | null
  onTerritorySelect?: (id: string) => void
}

export function TerritoryPanel({ lang, enabled, onEnabledChange, status, snapshot, hiddenActors, onActorToggle, onFocus, onRetry, comparisonDate, selectedTerritoryId, onTerritorySelect }: Props) {
  const details = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (!snapshot?.features.some((feature) => feature.id === selectedTerritoryId) || !details.current) return
    details.current.open = true
    const selected = [...details.current.querySelectorAll<HTMLElement>('[data-territory-id]')].find((element) => element.dataset.territoryId === selectedTerritoryId)
    selected?.scrollIntoView({ block: 'nearest' })
  }, [selectedTerritoryId, snapshot])
  const de = lang === 'de'
  const actors = [...new Map(snapshot?.features.map((feature) => [feature.actorId, feature]) ?? []).values()]
  const date = (value: string) => new Intl.DateTimeFormat(de ? 'de-DE' : 'en-GB', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(`${value}T00:00:00Z`))
  return <section className="glass w-[min(31rem,calc(100vw-2rem))] rounded-2xl p-3 text-xs" aria-label={de ? 'Besatzung und Kontrolle' : 'Occupation and control'} data-testid="territory-panel">
    <label className="flex cursor-pointer items-center gap-2 font-medium"><input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} className="accent-[#6fa8ff]" />{de ? 'Besatzung & Gebietskontrolle' : 'Occupation & territorial control'}</label>
    {enabled && <>
      {status === 'loading' && <p className="mt-2 text-muted-foreground" role="status">{de ? 'Datierte Gebietsflächen werden geladen…' : 'Loading dated territory areas…'}</p>}
      {status === 'error' && <p className="mt-2 text-destructive" role="alert">{de ? 'Gebietsflächen nicht verfügbar.' : 'Territory areas unavailable.'} <button className="underline" onClick={onRetry}>{de ? 'Erneut versuchen' : 'Retry'}</button></p>}
      {status === 'ready' && !snapshot && <p className="mt-2 text-muted-foreground" role="status">{de ? 'Für dieses Jahr liegen keine belegten Besatzungsflächen im Datensatz vor. Freie Flächen bedeuten keine Aussage über Kontrolle.' : 'No sourced occupation areas are available for this year. Unshaded areas make no statement about control.'}</p>}
      {snapshot && <>
        <p className="mt-2 text-muted-foreground" data-testid="territory-date">{de ? 'Gebietsstand' : 'Territory snapshot'}: <time dateTime={snapshot.date}>{date(snapshot.date)}</time>{comparisonDate && <> · {de ? 'rechts' : 'right'}: {date(comparisonDate)}</>}</p>
        {snapshot.features.length === 0 && <p className="mt-2 text-muted-foreground" role="status">{snapshot.coverage[lang]}</p>}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{actors.map((feature) => <label key={feature.actorId} className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={!hiddenActors.has(feature.actorId)} onChange={() => onActorToggle(feature.actorId)} style={{ accentColor: feature.color }} /><span className="inline-block size-2 rounded-full" style={{ background: feature.color }} />{feature.actor[lang]}</label>)}</div>
        <details ref={details} className="mt-2" data-testid="territory-sources"><summary className="cursor-pointer text-primary">{de ? 'Abdeckung, Genauigkeit & Quellen' : 'Coverage, precision & sources'}</summary><div className="scrollbar-thin mt-2 max-h-[22vh] space-y-3 overflow-y-auto pr-1">
          <p className="text-muted-foreground">{snapshot.coverage[lang]}</p>
          <p className="text-muted-foreground">{de ? 'Farben zeigen datierte Besatzung oder geschätzte Kontrolle, keine anerkannten Staatsgrenzen. Unmarkierte Räume sind nicht automatisch unbesetzt. Staatsgrenzen historisch: 1. Januar; Ereignisse und Flächen haben eigene Stichtage.' : 'Colors show dated occupation or estimated control, not recognized sovereign borders. Unshaded areas are not necessarily unoccupied. Historical state borders: 1 January; events and areas have independent dates.'}</p>
          {snapshot.features.map((feature) => <article key={feature.id} className={`rounded-lg border p-2 ${selectedTerritoryId === feature.id ? 'border-primary bg-primary/10' : 'border-input'}`} data-territory-id={feature.id}>
            <button className="text-left font-medium hover:text-primary" onClick={() => {
              onTerritorySelect?.(feature.id)
              if (hiddenActors.has(feature.actorId)) onActorToggle(feature.actorId)
              const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
              const ring = [...polygons].sort((a, b) => b[0].length - a[0].length)[0][0]
              const bounds = ring.reduce((b, [lng, lat]) => [Math.min(b[0], lng), Math.min(b[1], lat), Math.max(b[2], lng), Math.max(b[3], lat)], [180, 90, -180, -90])
              onFocus((bounds[1] + bounds[3]) / 2, (bounds[0] + bounds[2]) / 2)
            }}>{feature.title[lang]} ↗</button>
            <p className="mt-1" style={{ color: feature.color }}>{feature.actor[lang]} · {feature.kind === 'occupation' ? (de ? 'Besatzung' : 'Occupation') : feature.kind === 'control' ? (de ? 'Kontrolle' : 'Control') : (de ? 'Umstrittene Kontrolle' : 'Contested control')}</p>
            <p className="mt-1 text-muted-foreground">{feature.precision === 'schematic' ? (de ? 'Schematische regionale Rekonstruktion; keine präzise Front.' : 'Schematic regional reconstruction; not a precise front.') : (de ? 'Aus Siedlungsmeldungen geschätzte Flächen; keine Live-Front.' : 'Areas estimated from settlement reports; not a live front.')} · {feature.source.license}</p>
            <a className="mt-1 block text-primary underline" href={feature.source.url} target="_blank" rel="noreferrer">{feature.source.title} ↗</a>
          </article>)}
        </div></details>
      </>}
    </>}
  </section>
}
