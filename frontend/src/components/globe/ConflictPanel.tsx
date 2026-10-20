import { CONFLICT_LINES, sourceAgeDays, type ConflictBrief } from '@/lib/conflicts'

interface Props {
  briefs: ConflictBrief[]
  lang: 'de' | 'en'
  selected: ConflictBrief | null
  onSelect: (brief: ConflictBrief) => void
  onClose: () => void
}

export function ConflictPanel({ briefs, lang, selected, onSelect, onClose }: Props) {
  return <aside className="glass scrollbar-thin absolute bottom-4 right-4 top-[88px] z-20 w-[min(380px,calc(100vw-2rem))] overflow-y-auto rounded-[28px] p-5" aria-label={lang === 'de' ? 'Konflikte verstehen' : 'Understand conflicts'}>
    <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">{lang === 'de' ? 'Aktuelle Weltlage' : 'World today'}</p><h2 className="font-serif text-2xl">{lang === 'de' ? 'Konflikte verstehen' : 'Understanding conflicts'}</h2></div><button type="button" className="rounded-full border border-input px-3 py-1" onClick={onClose} aria-label={lang === 'de' ? 'Konflikte schließen' : 'Close conflicts'}>×</button></div>
    <p className="mt-3 text-xs text-muted-foreground">{lang === 'de' ? 'Redaktionell ausgewählte Konflikte mit datierten Quellen. Punkte markieren Regionen. Die Linie in der Ukraine zeigt eine geschätzte Grenze zwischen Kontrollkategorien, keine vermessene oder live aktualisierte Front.' : 'Curated conflicts with dated sources. Dots mark regions. The Ukraine line estimates a boundary between control categories, not a surveyed or live frontline.'}</p>
    <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-xs">
      <p><span className="text-rose-300">━━━━</span> {lang === 'de' ? 'Ukraine: geschätzte Kontaktzone' : 'Ukraine: estimated contact zone'}<span className="whitespace-nowrap"> · {CONFLICT_LINES.asOf}</span></p>
      <p className="mt-1 text-muted-foreground">{lang === 'de' ? 'Abgeleitet aus VIINA-Ortsdaten; Lage und Verlauf können abweichen.' : 'Derived from VIINA settlement data; position and course may differ.'}</p>
      {sourceAgeDays(CONFLICT_LINES.asOf) > 14 && <p className="mt-1 text-amber-200">{lang === 'de' ? `Datenstand ${sourceAgeDays(CONFLICT_LINES.asOf)} Tage alt – Aktualisierung prüfen.` : `Data is ${sourceAgeDays(CONFLICT_LINES.asOf)} days old – check for updates.`}</p>}
      <a href={CONFLICT_LINES.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-primary underline">VIINA 2.0 · ODbL 1.0 ↗</a>
    </div>
    <div className="mt-4 grid gap-2">{briefs.map((brief) => <button key={brief.id} type="button" onClick={() => onSelect(brief)} aria-pressed={selected?.id === brief.id} className={`rounded-xl border p-3 text-left transition-colors hover:border-primary ${selected?.id === brief.id ? 'border-primary bg-primary/10' : 'border-input bg-background/40'}`}>
      <span className="flex items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ background: brief.status === 'active' ? '#fb7185' : '#fbbf24' }} /><strong>{brief.title[lang]}</strong></span>
      <span className="mt-1 block text-xs text-muted-foreground">{brief.region[lang]} · {brief.sourceDate}</span>
    </button>)}</div>
    {selected && <article className="mt-5 border-t border-input pt-4" aria-live="polite">
      <p className="eyebrow">{selected.status === 'active' ? (lang === 'de' ? 'Aktiver Konflikt' : 'Active conflict') : (lang === 'de' ? 'Fragile Waffenruhe' : 'Fragile ceasefire')}</p>
      <h3 className="mt-1 font-serif text-xl">{selected.title[lang]}</h3>
      <p className="mt-2 text-sm">{selected.summary[lang]}</p>
      <p className="mt-2 text-xs text-muted-foreground">{selected.context[lang]}</p>
      <p className="mt-4 text-sm font-semibold">{selected.question[lang]}</p>
      <details className="mt-1 rounded-lg border border-input p-2 text-sm"><summary className="cursor-pointer text-primary">{lang === 'de' ? 'Einordnung ansehen' : 'Show explanation'}</summary><p className="mt-2">{selected.answer[lang]}</p></details>
      <p className="mt-4 text-xs text-muted-foreground">{lang === 'de' ? 'Quellenstand' : 'Source date'}: {selected.sourceDate} · {sourceAgeDays(selected.sourceDate)} {lang === 'de' ? 'Tage alt' : 'days old'}{sourceAgeDays(selected.sourceDate) > 60 ? (lang === 'de' ? ' · Aktualisierung prüfen' : ' · Review for updates') : ''}</p>
      <p className="mt-1 text-xs text-muted-foreground">{lang === 'de' ? 'Redaktionelle Revision' : 'Editorial revision'} {selected.revision} · {lang === 'de' ? 'Regionaler Orientierungspunkt' : 'Regional reference point'}</p>
      <p className="mt-1 text-xs text-muted-foreground">{selected.id === CONFLICT_LINES.conflictId
        ? (lang === 'de' ? `Geschätzte Kontaktzone: Datenstand ${CONFLICT_LINES.asOf}; kein exakter Frontverlauf.` : `Estimated contact zone: data as of ${CONFLICT_LINES.asOf}; not an exact frontline.`)
        : (lang === 'de' ? 'Für diesen Konflikt liegt hier keine belastbare, frei nutzbare Liniengeometrie vor.' : 'No reliable, reusable line geometry is available here for this conflict.')}</p>
      <a href={selected.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-primary underline">{selected.sourceName} ↗</a>
    </article>}
  </aside>
}
