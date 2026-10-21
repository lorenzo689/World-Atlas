import { useEffect, useState } from 'react'
import { WW1_MOMENTS, type Ww1Event, type Ww1Moment } from '@/lib/ww1'

interface Props {
  moment: Ww1Moment
  lang: 'de' | 'en'
  selectedEventId: string | null
  onYearChange: (year: number) => void
  onFocus: (lat: number, lng: number) => void
  onClose: () => void
}

export function Ww1Panel({ moment, lang, selectedEventId, onYearChange, onFocus, onClose }: Props) {
  const [selected, setSelected] = useState<Ww1Event | null>(null)
  useEffect(() => {
    if (selectedEventId) setSelected(moment.events.find((event) => event.id === selectedEventId) ?? null)
    else setSelected(null)
  }, [selectedEventId, moment])
  const choose = (event: Ww1Event) => {
    setSelected(event)
    onFocus(event.location.lat, event.location.lng)
  }
  return <div className="p-5 text-sm" aria-label={lang === 'de' ? 'Erster Weltkrieg' : 'World War I'}>
    <header className="flex items-start justify-between gap-3">
      <div><p className="eyebrow">{lang === 'de' ? 'Interaktiver Lernatlas · 1914–1918' : 'Interactive learning atlas · 1914–1918'}</p><h2 className="font-serif text-3xl">{lang === 'de' ? 'Erster Weltkrieg' : 'First World War'}</h2></div>
      <button type="button" className="rounded-full border border-input px-3 py-1" aria-label={lang === 'de' ? 'Ansicht schließen' : 'Close scenario'} onClick={onClose}>×</button>
    </header>
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{lang === 'de' ? 'Erkunde datierte historische Grenzen und ausgewählte, quellenbelegte Ereignisse. Die Marker sind Ortsangaben, keine Frontlinien.' : 'Explore dated historical boundaries and selected, sourced events. Markers identify locations; they are not front lines.'}</p>
    <div className="mt-4 flex flex-wrap gap-1" role="group" aria-label={lang === 'de' ? 'Kriegsjahr' : 'War year'}>
      {WW1_MOMENTS.map((item) => <button key={item.year} type="button" onClick={() => { onYearChange(item.year); setSelected(null) }} aria-pressed={moment.year === item.year} className="rounded-full border border-input px-2.5 py-1.5 text-xs aria-pressed:border-amber-300 aria-pressed:bg-amber-300/20">{item.year}</button>)}
    </div>
    <section className="mt-3 rounded-2xl border border-amber-300/35 bg-amber-300/10 p-4">
      <p className="text-[10px] uppercase tracking-[.16em] text-amber-200">{lang === 'de' ? 'Jahresüberblick' : 'Year in focus'} · {moment.year} · {moment.date}</p>
      <h3 className="mt-1 font-serif text-2xl">{moment.title[lang]}</h3>
      <p className="mt-2 text-xs leading-relaxed">{moment.overview[lang]}</p>
      <p className="mt-3 border-t border-amber-100/10 pt-2 text-[11px] leading-relaxed text-muted-foreground">{lang === 'de' ? `Grenzstand: 1. Januar ${moment.year} (CShapes 2.0). Ereignisdaten haben eigene Stichtage; heutige Satellitenbilder sind nur Hintergrund.` : `Boundary snapshot: 1 January ${moment.year} (CShapes 2.0). Events have their own dates; modern satellite imagery is background only.`}</p>
    </section>
    <h3 className="mt-5 text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">{lang === 'de' ? 'Ereignisse dieses Jahres' : 'Events this year'}</h3>
    <ul className="mt-2 space-y-2">
      {moment.events.map((event) => <li key={event.id}>
        <button type="button" aria-pressed={selected?.id === event.id} onClick={() => choose(event)} className="w-full rounded-xl border border-input p-3 text-left transition hover:border-amber-300/60 aria-pressed:border-amber-300 aria-pressed:bg-amber-300/10">
          <time className="tabular text-[10px] text-amber-200" dateTime={event.date}>{event.date}</time>
          <span className="mt-1 block font-medium">{event.title[lang]}</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{event.summary[lang]}</span>
          <span className="mt-2 block text-[10px] text-primary">{event.source.title} ↗</span>
        </button>
        <a className="sr-only" href={event.source.url} target="_blank" rel="noreferrer">{event.source.title}</a>
      </li>)}
    </ul>
    {selected && <div className="mt-3 rounded-xl border border-primary/40 p-3" role="status"><p className="text-xs">{lang === 'de' ? 'Kartenfokus' : 'Map focus'} · {selected.title[lang]}</p><a className="mt-1 inline-block text-xs text-primary underline" href={selected.source.url} target="_blank" rel="noreferrer">{lang === 'de' ? 'Quelle öffnen' : 'Open source'} ↗</a></div>}
    <a href="https://www.archives.gov/topics/wwi" target="_blank" rel="noreferrer" className="mt-4 block text-xs text-primary underline">{lang === 'de' ? 'Weitere Dokumente: U.S. National Archives' : 'Explore more records: U.S. National Archives'} ↗</a>
  </div>
}
