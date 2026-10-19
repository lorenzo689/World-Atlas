import { sourceAgeDays, type ConflictBrief } from '@/lib/conflicts'

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
    <p className="mt-3 text-xs text-muted-foreground">{lang === 'de' ? 'Redaktionell ausgewählte Lernpunkte mit datierten UN-Quellen. Positionen sind regionale Orientierungspunkte, keine Frontlinien oder exakten Ereignisorte.' : 'Curated learning points with dated UN sources. Positions indicate regions, not frontlines or exact incident sites.'}</p>
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
      <a href={selected.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-primary underline">{selected.sourceName} ↗</a>
    </article>}
  </aside>
}
