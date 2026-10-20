import { useEffect, useState } from 'react'
import { WW2_MOMENTS, type Ww2Event, type Ww2Front, type Ww2Moment, type Ww2Theater } from '@/lib/ww2'

const theaters: { id: Ww2Theater | 'all'; de: string; en: string }[] = [
  { id: 'all', de: 'Alle', en: 'All' },
  { id: 'europe', de: 'Europa', en: 'Europe' },
  { id: 'north-africa', de: 'Nordafrika', en: 'North Africa' },
  { id: 'asia-pacific', de: 'Asien/Pazifik', en: 'Asia/Pacific' },
]

interface Props {
  moment: Ww2Moment
  lang: 'de' | 'en'
  theater: Ww2Theater | 'all'
  onTheaterChange: (theater: Ww2Theater | 'all') => void
  showFronts: boolean
  onShowFrontsChange: (show: boolean) => void
  showEvents: boolean
  onShowEventsChange: (show: boolean) => void
  onYearChange: (year: number) => void
  onFocus: (lat: number, lng: number) => void
  selectedEventId: string | null
  onClose: () => void
}

export function Ww2Panel({ moment, lang, theater, onTheaterChange, showFronts, onShowFrontsChange, showEvents, onShowEventsChange, onYearChange, onFocus, selectedEventId, onClose }: Props) {
  const [answerOpen, setAnswerOpen] = useState(false)
  const [selected, setSelected] = useState<Ww2Front | Ww2Event | null>(null)
  const fronts = moment.fronts.filter((front) => theater === 'all' || front.theater === theater)
  const events = moment.events.filter((event) => theater === 'all' || event.theater === theater)
  const filteredSelected = selected && (fronts.some((front) => front.id === selected.id) || events.some((event) => event.id === selected.id)) ? selected : null

  useEffect(() => {
    if (selectedEventId) setSelected(moment.events.find((event) => event.id === selectedEventId) ?? null)
  }, [selectedEventId, moment])

  const chooseFront = (front: Ww2Front) => {
    setSelected(front)
    const middle = front.line[Math.floor(front.line.length / 2)]
    onFocus(middle[1], middle[0])
  }
  const chooseEvent = (event: Ww2Event) => {
    setSelected(event)
    onFocus(event.location.lat, event.location.lng)
  }

  return <div className="p-5 text-sm" aria-label={lang === 'de' ? 'Zweiter Weltkrieg' : 'World War II'}>
    <div className="flex items-start justify-between gap-2">
      <div><p className="eyebrow">{lang === 'de' ? 'Lernatlas · 1939–1945' : 'Learning atlas · 1939–1945'}</p><h2 className="font-serif text-2xl">{lang === 'de' ? 'Zweiter Weltkrieg' : 'World War II'}</h2></div>
      <button type="button" className="rounded-full border border-input px-3 py-1" aria-label={lang === 'de' ? 'Weltkriegsansicht schließen' : 'Close World War II view'} onClick={onClose}>×</button>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">{lang === 'de' ? 'Keine Kriegssimulation: datierte Quellen, ausgewählte Schauplätze und die Folgen für Menschen.' : 'Not a war simulation: dated sources, selected theaters and human consequences.'}</p>
    <aside className="mt-3 rounded-xl border border-primary/40 bg-primary/10 p-3 text-xs leading-relaxed" role="note">
      <strong>{lang === 'de' ? 'Korrigierte Reichsgrenzen · 1. Januar' : 'Corrected Reich boundaries · 1 January'}</strong>{' '}
      {lang === 'de'
        ? 'Die datierte Annexionsfläche zeigt Österreich sowie Memel, Danzig und Teile Westpolens erst nach ihrer jeweiligen Annexion. Generalgouvernement und Protektorat sind nicht Teil dieser Fläche. Besatzung und schematische Frontlinien bleiben eigene Kategorien. Die OHM-Grenzgeometrie ist näherungsweise.'
        : 'The dated footprint shows Austria, then Memel, Danzig and parts of western Poland only after their respective annexations. The General Government and Protectorate are excluded. Occupation and schematic front lines remain separate categories. OHM boundary geometry is approximate.'}
      <a href="https://encyclopedia.ushmm.org/content/en/article/invasion-of-poland-fall-1939" target="_blank" rel="noreferrer" className="mt-2 block text-primary underline">{lang === 'de' ? 'Historischer Kontext: USHMM' : 'Historical context: USHMM'} ↗</a>
    </aside>
    <div className="mt-4 flex flex-wrap gap-1" role="group" aria-label={lang === 'de' ? 'Kriegsjahr' : 'War year'}>{WW2_MOMENTS.map((item) => <button key={item.year} type="button" onClick={() => { onYearChange(item.year); setSelected(null); setAnswerOpen(false) }} aria-pressed={moment.year === item.year} className="rounded-full border border-input px-2 py-1 text-xs aria-pressed:border-amber-300 aria-pressed:bg-amber-300/20">{item.year}</button>)}</div>
    <div className="mt-3 rounded-xl border border-amber-300/40 bg-amber-300/10 p-3">
      <p className="text-xs uppercase tracking-widest text-amber-200">{lang === 'de' ? 'Stichtag' : 'Snapshot'} · <time dateTime={moment.date}>{moment.date}</time></p>
      <h3 className="mt-1 font-serif text-xl">{moment.title[lang]}</h3>
      <p className="mt-2 text-xs leading-relaxed">{moment.overview[lang]}</p>
      <p className="mt-2 text-[11px] text-amber-100/80">{lang === 'de' ? `Wichtig: Staatsgrenzen zeigen den 1. Januar ${moment.year}; Frontabschnitte den ${moment.date}. Das sind unterschiedliche Datensätze und Stichtage.` : `Important: state borders show 1 January ${moment.year}; front sections show ${moment.date}. These are different datasets and dates.`}</p>
    </div>
    <div className="mt-4 flex flex-wrap gap-1" role="group" aria-label={lang === 'de' ? 'Kriegsschauplatz' : 'Theater'}>{theaters.map((item) => <button key={item.id} type="button" aria-pressed={theater === item.id} onClick={() => onTheaterChange(item.id)} className="rounded-full border border-input px-2 py-1 text-[11px] aria-pressed:border-primary aria-pressed:text-primary">{item[lang]}</button>)}</div>
    <fieldset className="mt-3 rounded-xl border border-input p-3 text-xs"><legend className="px-1">{lang === 'de' ? 'Kartenebenen' : 'Map layers'}</legend>
      <label className="flex items-center gap-2"><input type="checkbox" checked readOnly disabled />{lang === 'de' ? 'Historische Grenzen (CShapes + OHM)' : 'Historical boundaries (CShapes + OHM)'}</label>
      <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={showFronts} onChange={(e) => onShowFrontsChange(e.target.checked)} />{lang === 'de' ? 'Schematische Frontabschnitte' : 'Schematic front sections'}</label>
      <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={showEvents} onChange={(e) => onShowEventsChange(e.target.checked)} />{lang === 'de' ? 'Ereignisorte' : 'Event locations'}</label>
      <p className="mt-2 text-muted-foreground">{lang === 'de' ? 'Besatzung/Kontrolle ist eine andere Ebene. Mangels geprüfter Flächengeometrie wird sie hier nicht behauptet.' : 'Occupation/control is a separate layer. No unverified territory polygons are claimed here.'}</p>
    </fieldset>
    <p className="mt-3 text-xs text-muted-foreground"><span className="text-amber-300">━━━━</span> {lang === 'de' ? 'Grobe Quelleninterpretation; keine vermessene Front. Lücken bedeuten: hier kein geprüfter Verlauf.' : 'Coarse source interpretation, not a surveyed line. Gaps mean no validated course is available here.'}</p>
    <h3 className="mt-4 font-semibold">{lang === 'de' ? 'Frontabschnitte' : 'Front sections'}</h3>
    {fronts.length ? <div className="mt-2 grid gap-1">{fronts.map((front) => <button key={front.id} type="button" onClick={() => chooseFront(front)} className="rounded-lg border border-input p-2 text-left text-xs hover:border-amber-300">{front.title[lang]} · <time dateTime={front.date}>{front.date}</time></button>)}</div> : <p className="mt-2 text-xs text-muted-foreground">{lang === 'de' ? 'Für diesen Schauplatz liegt zu diesem Stichtag kein geprüfter Frontabschnitt vor.' : 'No validated front section is available for this theater and date.'}</p>}
    <h3 className="mt-4 font-semibold">{lang === 'de' ? 'Ereignisse' : 'Events'}</h3>
    {events.length ? <div className="mt-2 grid gap-1">{events.map((event) => <button key={event.id} type="button" onClick={() => chooseEvent(event)} className="rounded-lg border border-input p-2 text-left text-xs hover:border-primary">{event.title[lang]} · <time dateTime={event.date}>{event.date}</time></button>)}</div> : <p className="mt-2 text-xs text-muted-foreground">{lang === 'de' ? 'Für diesen Schauplatz ist noch kein Ereignis hinterlegt.' : 'No event is available for this theater.'}</p>}
    {filteredSelected && <article className="mt-3 rounded-xl border border-primary/40 p-3 text-xs" aria-live="polite"><h4 className="font-semibold">{filteredSelected.title[lang]}</h4><p className="mt-1 text-muted-foreground">{'explanation' in filteredSelected ? filteredSelected.explanation[lang] : filteredSelected.source.note[lang]}</p><a className="mt-2 block text-primary underline" href={filteredSelected.source.url} target="_blank" rel="noreferrer">{filteredSelected.source.title} ↗</a></article>}
    <div className="mt-4 rounded-xl border border-input p-3 text-xs"><h3 className="font-semibold">{lang === 'de' ? 'Menschen im Krieg' : 'People in war'}</h3><p className="mt-1 text-muted-foreground">{moment.people[lang]}</p><a className="mt-2 block text-primary underline" href={moment.peopleSource.url} target="_blank" rel="noreferrer">{moment.peopleSource.title} ↗</a></div>
    <div className="mt-3 rounded-xl border border-input p-3 text-xs"><h3 className="font-semibold">{lang === 'de' ? 'Denkfrage' : 'Think about it'}</h3><p className="mt-1">{moment.question[lang]}</p><button type="button" onClick={() => setAnswerOpen((open) => !open)} className="mt-2 text-primary underline">{answerOpen ? (lang === 'de' ? 'Antwort verbergen' : 'Hide answer') : (lang === 'de' ? 'Antwort zeigen' : 'Show answer')}</button>{answerOpen && <p className="mt-2 text-muted-foreground">{moment.answer[lang]}</p>}</div>
    <p className="mt-4 text-[11px] text-muted-foreground">{lang === 'de' ? 'Quellenkritik: Die Karten zeigen ausgewählte Lagebilder, keine lückenlose oder exakte Rekonstruktion aller Fronten. Ereignisse außerhalb des Stichtags ändern nicht rückwirkend die Linie.' : 'Source note: These are selected situation maps, not a complete or exact reconstruction of all fronts. Events after the snapshot do not retroactively change its line.'}</p>
  </div>
}
