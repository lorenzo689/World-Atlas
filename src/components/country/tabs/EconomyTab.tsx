import { useState } from 'react'
import type { Country } from '@/types'
import { useIndicators } from '@/hooks/useIndicator'
import { INDICATORS, type IndicatorKey } from '@/lib/indicators'
import { IndicatorCard, RangeToggle, StatTile, type Range } from '@/components/charts/IndicatorCard'
import { CHART_COLORS } from '@/components/charts/TimeSeriesChart'

const KEYS: IndicatorKey[] = ['gdp', 'gdpPerCapita', 'gdpGrowth', 'inflation', 'unemployment']

export function EconomyTab({ country }: { country: Country }) {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Economic indicators for {country.name}. GDP is in current US dollars, so values aren’t adjusted for inflation or exchange-rate
          swings.
        </p>
        <RangeToggle value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['gdp', 'gdpPerCapita', 'inflation', 'unemployment'] as IndicatorKey[]).map((k) => {
          const m = INDICATORS[k]
          const s = data?.[k]
          return (
            <StatTile
              key={k}
              label={m.short}
              loading={res.status === 'loading'}
              value={s?.latest ? m.format(s.latest.value) : '—'}
              year={s?.latest?.year}
              unit={k === 'gdp' || k === 'gdpPerCapita' ? 'current US$' : m.unit}
            />
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <IndicatorCard {...common} title="Gross domestic product" keys={['gdp']} variant="area" />
        <IndicatorCard {...common} title="GDP per capita" keys={['gdpPerCapita']} variant="line" colors={[CHART_COLORS.mint]} />
        <IndicatorCard {...common} title="GDP growth" keys={['gdpGrowth']} variant="bar" zeroLine colors={[CHART_COLORS.primary]} />
        <IndicatorCard {...common} title="Inflation" description="Annual change in consumer prices." keys={['inflation']} variant="line" zeroLine colors={[CHART_COLORS.amber]} />
        <IndicatorCard
          {...common}
          title="Unemployment"
          description="Share of the labour force without work, modelled ILO estimate."
          keys={['unemployment']}
          variant="area"
          colors={[CHART_COLORS.violet]}
          className="lg:col-span-2"
        />
      </div>
    </div>
  )
}
