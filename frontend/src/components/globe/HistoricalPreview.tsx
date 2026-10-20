import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { HistoricalEntity } from '@/lib/history'
import { commonsFlagUrl } from '@/lib/history'
import { comparableIso, fetchHistoricalContext, type HistoricalContext } from '@/lib/historicalContext'
import { useLang, useT } from '@/i18n'

interface Props {
  entity: HistoricalEntity
  year: number
  onClose: () => void
}

export function HistoricalPreview({ entity, year, onClose }: Props) {
  const t = useT()
  const lang = useLang((state) => state.lang)
  const iso = comparableIso(entity, year)
  const [context, setContext] = useState<HistoricalContext | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setContext(null)
    if (!iso) return
    let live = true
    setLoading(true)
    const timer = window.setTimeout(() => {
      fetchHistoricalContext(iso, year).then(
        (value) => { if (live) { setContext(value); setLoading(false) } },
        () => { if (live) setLoading(false) },
      )
    }, 180)
    return () => { live = false; window.clearTimeout(timer) }
  }, [iso, year])
  const format = (value: number | null) => value == null ? (lang === 'de' ? 'Keine Beobachtung' : 'No observation') : new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US').format(value)
  return (
    <article className="px-6 pb-6 pt-5">
      <header className="flex items-start gap-4">
        {entity.flagFile ? (
          <img src={commonsFlagUrl(entity.flagFile)} alt={t('history.flagOf', { name: entity.name })} className="h-[45px] w-[60px] shrink-0 rounded object-contain ring-1 ring-white/15" />
        ) : (
          <div className="flex h-[45px] w-[60px] shrink-0 items-center justify-center rounded border border-border text-[10px] text-muted-foreground">{t('history.noFlag')}</div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-[30px] leading-[1.05]">{entity.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('history.asOf', { year })}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t('explore.close')} className="rounded-full p-1 hover:bg-white/10"><X className="size-4" /></button>
      </header>
      {entity.capital && <p className="mt-5 text-sm"><span className="eyebrow mr-2">{t('compare.capital')}</span>{entity.capital}</p>}
      {year >= 1939 && year <= 1945 && (entity.code === 'H255' || entity.code === 'H290' || entity.code === 'H368' || entity.code === 'HDANZIG') && (
        <aside className="mt-5 rounded-xl border border-primary/40 bg-primary/10 p-3 text-xs leading-relaxed" role="note">
          <strong>{lang === 'de' ? 'Grenztyp: Annexion, nicht Besatzung.' : 'Boundary type: annexation, not occupation.'}</strong>{' '}
          {lang === 'de'
            ? 'Die Reichsfläche für den 1. Januar dieses Jahres wurde mit datierten OpenHistoricalMap-Grenzen korrigiert. Generalgouvernement und Protektorat Böhmen und Mähren sind ausdrücklich ausgenommen. Die übrigen Länder folgen weiterhin CShapes; Grenzverläufe sind näherungsweise rekonstruiert.'
            : 'The Reich footprint for 1 January of this year was corrected using dated OpenHistoricalMap boundaries. The General Government and Protectorate of Bohemia and Moravia are explicitly excluded. Other countries still follow CShapes; boundary geometry remains approximate.'}
          <a href="https://www.openhistoricalmap.org/copyright" target="_blank" rel="noreferrer" className="mt-2 block text-primary underline">OpenHistoricalMap ↗</a>
        </aside>
      )}
      <section className="mt-6 rounded-2xl border border-border bg-background/45 p-4" aria-label={lang === 'de' ? 'Historischer Datenkontext' : 'Historical data context'}>
        <h3 className="font-serif text-lg">{lang === 'de' ? `Daten für ${year}` : `Data for ${year}`}</h3>
        {!iso ? (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{lang === 'de' ? 'Für diesen historischen Staat ist eine verlässliche Zuordnung zu heutigen Statistikgebieten nicht möglich.' : 'This historical state cannot be reliably matched to a present-day statistical territory.'}</p>
        ) : (
          <>
            <dl className="mt-3 grid gap-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">{lang === 'de' ? 'Bevölkerung' : 'Population'}</dt><dd className="tabular font-semibold">{loading ? '…' : format(context?.population ?? null)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{lang === 'de' ? 'Geflüchtete aus dem Land (Bestand)' : 'Refugees from country (stock)'}</dt><dd className="tabular font-semibold">{loading ? '…' : format(context?.refugees ?? null)}</dd></div>
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{lang === 'de' ? 'Exakte Jahreswerte; kein Ersatz durch benachbarte Jahre. UNHCR zählt den Bestand Geflüchteter nach Herkunft, keine jährlichen Fluchtbewegungen. Statistikgebiete können von den gezeigten historischen Grenzen abweichen.' : 'Exact-year observations; adjacent years are never substituted. UNHCR reports refugee stock by origin, not annual flows. Statistical territories may differ from the historical boundaries shown.'}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-primary">
              <a target="_blank" rel="noreferrer" href={`https://data.worldbank.org/indicator/SP.POP.TOTL?locations=${iso}`}>World Bank ↗</a>
              <a target="_blank" rel="noreferrer" href="https://www.unhcr.org/refugee-statistics/">UNHCR ↗</a>
            </div>
          </>
        )}
      </section>
      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{t('history.sourceNote')}</p>
      <a href="https://icr.ethz.ch/data/cshapes/" target="_blank" rel="noreferrer" className="mt-2 block text-xs text-primary hover:underline">CShapes 2.0 ↗</a>
      {entity.flagFile && <a href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(entity.flagFile.replace(/ /g, '_'))}`} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-primary hover:underline">{t('history.flagSource')} ↗</a>}
    </article>
  )
}
