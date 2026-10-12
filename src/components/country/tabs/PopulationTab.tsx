import { useState } from 'react'
import type { Country } from '@/types'
import { useIndicators } from '@/hooks/useIndicator'
import { INDICATORS, type IndicatorKey } from '@/lib/indicators'
import { formatPercent } from '@/lib/format'
import { IndicatorCard, RangeToggle, StatTile, type Range } from '@/components/charts/IndicatorCard'
import { CHART_COLORS } from '@/components/charts/TimeSeriesChart'

const KEYS: IndicatorKey[] = [
  'population',
  'populationGrowth',
  'density',
  'lifeExpectancy',
  'urbanization',
  'fertility',
  'age0_14',
  'age15_64',
  'age65plus',
  'birthRate',
  'deathRate',
]
const TILES: IndicatorKey[] = ['population', 'populationGrowth', 'lifeExpectancy', 'urbanization']
const AGE: { key: IndicatorKey; color: string }[] = [
  { key: 'age0_14', color: CHART_COLORS.mint },
  { key: 'age15_64', color: CHART_COLORS.primary },
  { key: 'age65plus', color: CHART_COLORS.amber },
]

export function PopulationTab({ country }: { country: Country }) {
  const [range, setRange] = useState<Range>('all')
  const res = useIndicators(country.code, KEYS)
  const data = res.status === 'success' ? res.data : null
  const common = {
    data,
    loading: res.status === 'loading',
    error: res.status === 'error' ? res.error : null,
    onRetry: res.retry,
    range,
  }

  const ageLatest = AGE.map((a) => ({ ...a, p: data?.[a.key]?.latest }))
  const ageYear = ageLatest.every((a) => a.p) ? Math.min(...ageLatest.map((a) => a.p!.year)) : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Demographic indicators for {country.name}. Charts show every year the World Bank publishes; gaps are left blank.
        </p>
        <RangeToggle value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TILES.map((k) => {
          const m = INDICATORS[k]
          const s = data?.[k]
          return (
            <StatTile
              key={k}
              label={m.short}
              loading={res.status === 'loading'}
              value={s?.latest ? m.format(s.latest.value) : '—'}
              year={s?.latest?.year}
              unit={k === 'population' ? undefined : m.unit}
            />
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <IndicatorCard {...common} title="Total population" keys={['population']} variant="area" />
        <IndicatorCard {...common} title="Population growth" keys={['populationGrowth']} variant="bar" zeroLine />
      </div>

      <section className="rounded-3xl border border-border bg-white/[0.02] p-5 sm:p-6" aria-labelledby="age-now">
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="age-now" className="text-[15px] font-medium">
            Age structure{ageYear ? `, ${ageYear}` : ''}
          </h3>
          <p className="text-xs text-muted-foreground">% of total population</p>
        </header>
        {res.status === 'loading' ? (
          <div className="skeleton h-14 w-full" />
        ) : ageYear ? (
          <>
            <div className="flex h-10 overflow-hidden rounded-xl" role="img" aria-label="Age structure of the population">
              {ageLatest.map((a) => (
                <div
                  key={a.key}
                  className="flex items-center justify-center text-[12px] font-medium text-[#06101f]"
                  style={{ width: `${a.p!.value}%`, background: a.color }}
                  title={`${INDICATORS[a.key].short}: ${formatPercent(a.p!.value)}`}
                >
                  {a.p!.value > 9 ? formatPercent(a.p!.value) : ''}
                </div>
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              {ageLatest.map((a) => (
                <li key={a.key} className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ background: a.color }} />
                  {INDICATORS[a.key].short}
                  <span className="tabular text-foreground">{formatPercent(a.p!.value)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Age-structure data isn’t published for this country.</p>
        )}
        <p className="mt-4 text-[11px] text-muted-foreground">
          Source: World Bank Open Data · SP.POP.0014.TO.ZS, SP.POP.1564.TO.ZS, SP.POP.65UP.TO.ZS
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <IndicatorCard
          {...common}
          title="Age structure over time"
          keys={AGE.map((a) => a.key)}
          colors={AGE.map((a) => a.color)}
          variant="stacked-area"
        />
        <IndicatorCard {...common} title="Life expectancy at birth" keys={['lifeExpectancy']} variant="line" colors={[CHART_COLORS.mint]} />
        <IndicatorCard {...common} title="Urbanization" description="Share of people living in urban areas." keys={['urbanization']} variant="area" colors={[CHART_COLORS.violet]} />
        <IndicatorCard
          {...common}
          title="Births and deaths"
          keys={['birthRate', 'deathRate']}
          colors={[CHART_COLORS.mint, CHART_COLORS.rose]}
          variant="line"
        />
        <IndicatorCard {...common} title="Fertility rate" keys={['fertility']} variant="line" colors={[CHART_COLORS.amber]} />
        <IndicatorCard {...common} title="Population density" keys={['density']} variant="area" />
      </div>
    </div>
  )
}
