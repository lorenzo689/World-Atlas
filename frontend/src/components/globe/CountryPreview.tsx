import { Link } from 'react-router-dom'
import { ArrowRight, Scale, X } from 'lucide-react'
import type { Country } from '@/types'
import { useIndicator } from '@/hooks/useIndicator'
import { INDICATORS } from '@/lib/indicators'
import { formatArea, formatCompact, formatNumber } from '@/lib/format'
import { Flag } from '@/components/country/Flag'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useT } from '@/i18n'
import { AtlasActions } from '@/components/globe/AtlasActions'

interface CountryPreviewProps {
  country: Country
  neighbours: Country[]
  onClose: () => void
  onSelectNeighbour: (code: string) => void
}

function Fact({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="py-3">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-[15px] leading-snug text-foreground">
        {children}
        {note && <span className="ml-2 text-xs text-muted-foreground">{note}</span>}
      </dd>
    </div>
  )
}

/** Compact country card used in the desktop side panel and the mobile bottom sheet. */
export function CountryPreview({ country, neighbours, onClose, onSelectNeighbour }: CountryPreviewProps) {
  const t = useT()
  const pop = useIndicator(country.code, 'population')

  return (
    <article aria-labelledby="preview-title" className="px-6 pb-6 pt-5">
      <header className="flex items-start gap-4">
        <Flag code={country.code} name={country.name} className="h-[45px] w-[60px] shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 id="preview-title" className="font-serif text-[32px] leading-[1.05] tracking-tight">
            {country.name}
          </h2>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={country.officialName}>
            {country.officialName}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('explore.close')} className="-mr-2 -mt-1">
          <X />
        </Button>
      </header>

      <p className="mt-4 text-xs text-muted-foreground">
        {[country.subregion, country.region].filter((v, i, a) => v && a.indexOf(v) === i).join(' · ')}
        {!country.independent && ` · ${t('explore.dependent')}`}
      </p>

      <AtlasActions code={country.code} />

      <dl className="mt-3 divide-y divide-border">
        <Fact label={t('compare.capital')}>{country.capital.length ? country.capital.join(', ') : '—'}</Fact>
        <Fact
          label={t('indicator.population')}
          note={pop.status === 'success' && pop.data.latest ? String(pop.data.latest.year) : undefined}
        >
          {pop.status === 'loading' && <Skeleton className="inline-block h-5 w-24 align-middle" />}
          {pop.status === 'error' && <span className="text-muted-foreground">{t('explore.unavailable')}</span>}
          {pop.status === 'success' &&
            (pop.data.latest ? (
              <span className="tabular">{formatNumber(pop.data.latest.value)}</span>
            ) : (
              <span className="text-muted-foreground">{t('explore.notReported')}</span>
            ))}
        </Fact>
        <Fact label={t('compare.area')}>
          <span className="tabular">{formatArea(country.area)}</span>
        </Fact>
        <Fact label={t('explore.currency')}>
          {country.currencies.length
            ? country.currencies.map((c) => `${c.name}${c.symbol ? ` (${c.symbol})` : ''}`).join(', ')
            : '—'}
        </Fact>
        <Fact label={t('compare.languages')}>{country.languages.length ? country.languages.join(', ') : '—'}</Fact>
        <Fact label={`${t('explore.neighbours')}${neighbours.length ? ` · ${neighbours.length}` : ''}`}>
          {neighbours.length ? (
            <ul className="-ml-0.5 flex flex-wrap gap-1.5 pt-1">
              {neighbours.map((n) => (
                <li key={n.code}>
                  <button
                    type="button"
                    onClick={() => onSelectNeighbour(n.code)}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-white/[0.03] py-1 pl-1.5 pr-3 text-[13px] transition-colors hover:border-primary/50 hover:bg-white/[0.08]"
                  >
                    <Flag code={n.code} name="" className="h-3 w-4 rounded-[2px]" />
                    {n.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted-foreground">
              {country.landlocked ? t('explore.none') : t('explore.noBorders')}
            </span>
          )}
        </Fact>
      </dl>

      <Button asChild className="mt-5 w-full">
        <Link to={`/countries/${country.code}`}>
          {t('explore.explore', { name: country.name })} <ArrowRight />
        </Link>
      </Button>
      <Button asChild variant="outline" className="mt-2 w-full">
        <Link to={`/compare?a=${country.code}`}>
          <Scale /> {t('explore.compare')}
        </Link>
      </Button>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        {t('explore.sources', { label: INDICATORS.population.label })}
      </p>
      {pop.status === 'success' && pop.data.latest && (
        <p className="sr-only">{t('explore.approx', { n: formatCompact(pop.data.latest.value) })}</p>
      )}
    </article>
  )
}
