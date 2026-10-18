import { useMemo } from 'react'
import { ExternalLink } from 'lucide-react'
import type { Country } from '@/types'
import { useIndicators } from '@/hooks/useIndicator'
import { useWikiSummary } from '@/hooks/useMisc'
import { INDICATORS, type IndicatorKey } from '@/lib/indicators'
import { formatArea, formatCoordinate, formatNumber, pluralize } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/components/charts/IndicatorCard'

const HIGHLIGHTS: IndicatorKey[] = ['population', 'gdp', 'gdpPerCapita', 'lifeExpectancy']

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-4 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Rank by area among all countries/territories in the dataset (area source: mledoze/countries). */
function areaRank(country: Country, all: Country[]): { rank: number; total: number } | null {
  if (!country.area) return null
  const withArea = all.filter((c) => c.area)
  const rank = withArea.filter((c) => (c.area as number) > (country.area as number)).length + 1
  return { rank, total: withArea.length }
}

export function OverviewTab({ country, countries, byCode }: { country: Country; countries: Country[]; byCode: Map<string, Country> }) {
  const wiki = useWikiSummary(country.name, country.officialName)
  const stats = useIndicators(country.code, [...HIGHLIGHTS, 'density'])
  const rank = useMemo(() => areaRank(country, countries), [country, countries])
  const neighbours = country.borders.map((b) => byCode.get(b)).filter((c): c is Country => !!c)

  const context = [
    `${country.name} is ${country.independent ? 'a sovereign state' : 'a territory'} in ${
      country.subregion && country.subregion !== country.region ? `${country.subregion}, ${country.region}` : country.region
    }.`,
    country.capital.length ? `Its capital is ${country.capital.join(', ')}.` : null,
    neighbours.length
      ? `It shares land borders with ${pluralize(neighbours.length, 'country', 'countries')}: ${neighbours.map((n) => n.name).join(', ')}.`
      : country.landlocked
        ? 'It has no land borders.'
        : 'It has no land borders and is surrounded by water.',
    country.landlocked && neighbours.length ? 'It is landlocked, with no coastline.' : null,
    rank ? `By area it ranks #${rank.rank} of ${rank.total} countries and territories with a recorded area.` : null,
  ].filter(Boolean)

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-10">
        <section aria-labelledby="about">
          <h2 id="about" className="eyebrow mb-4">
            About
          </h2>
          {wiki.status === 'loading' && (
            <div className="space-y-2.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          )}
          {wiki.status === 'success' && wiki.data && (
            <>
              <p className="max-w-[62ch] font-serif text-[22px] leading-[1.45] text-foreground/95">{wiki.data.extract}</p>
              <a
                href={wiki.data.url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Summary from Wikipedia (CC BY-SA) <ExternalLink className="size-3" aria-hidden />
              </a>
            </>
          )}
          {(wiki.status === 'error' || (wiki.status === 'success' && !wiki.data)) && (
            <p className="max-w-[62ch] text-sm text-muted-foreground">
              A written description couldn’t be loaded right now. The facts below come from our country dataset.
            </p>
          )}
        </section>

        <section aria-labelledby="context">
          <h2 id="context" className="eyebrow mb-4">
            Geographic context
          </h2>
          <p className="max-w-[62ch] text-[15px] leading-relaxed text-foreground/85">{context.join(' ')}</p>
        </section>

        <section aria-labelledby="snapshot">
          <h2 id="snapshot" className="eyebrow mb-4">
            Snapshot
          </h2>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {HIGHLIGHTS.map((k) => {
              const m = INDICATORS[k]
              const s = stats.status === 'success' ? stats.data[k] : undefined
              return (
                <StatTile
                  key={k}
                  label={m.short}
                  loading={stats.status === 'loading'}
                  value={s?.latest ? m.format(s.latest.value) : '—'}
                  year={s?.latest?.year}
                  unit={k === 'population' ? undefined : m.unit}
                />
              )
            })}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">Source: World Bank Open Data. Each value shows its own reference year.</p>
        </section>
      </div>

      <aside aria-labelledby="facts" className="rounded-3xl border border-border bg-white/[0.02] p-6 lg:self-start">
        <h2 id="facts" className="eyebrow">
          Key facts
        </h2>
        <dl className="mt-2 divide-y divide-border">
          <Row label="Official name">{country.officialName}</Row>
          <Row label="Capital">{country.capital.join(', ') || '—'}</Row>
          <Row label="Region">{[country.subregion, country.region].filter(Boolean).join(', ')}</Row>
          <Row label="Area">{formatArea(country.area)}</Row>
          <Row label="Density">
            {stats.status === 'success' && stats.data.density?.latest
              ? `${formatNumber(stats.data.density.latest.value, 1)} / km² (${stats.data.density.latest.year})`
              : '—'}
          </Row>
          <Row label="Currency">
            {country.currencies.map((c) => `${c.name} (${c.code}${c.symbol ? `, ${c.symbol}` : ''})`).join(', ') || '—'}
          </Row>
          <Row label="Languages">{country.languages.join(', ') || '—'}</Row>
          <Row label="Calling code">{country.callingCode ?? '—'}</Row>
          <Row label="Internet TLD">{country.tld.join(', ') || '—'}</Row>
          <Row label="UN member">{country.unMember ? 'Yes' : 'No'}</Row>
          <Row label="Coordinates">{country.latlng ? formatCoordinate(country.latlng[0], country.latlng[1]) : '—'}</Row>
          <Row label="ISO codes">
            {country.code2} · {country.code}
          </Row>
        </dl>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Metadata: mledoze/countries (ODbL). Area and coordinates carry no reference year.
        </p>
      </aside>
    </div>
  )
}
