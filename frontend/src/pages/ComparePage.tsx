import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight } from 'lucide-react'
import { dataApi, type ProfileValue } from '@/lib/backend'
import { INDICATORS, type IndicatorKey } from '@/lib/indicators'
import { formatArea } from '@/lib/format'
import { useBoundaries } from '@/hooks/useBoundaries'
import { useCountries } from '@/hooks/useCountries'
import { useDocumentMeta } from '@/hooks/useMisc'
import { useT, type MessageKey } from '@/i18n'
import { Card, PageShell } from '@/components/layout/PageShell'
import { Flag } from '@/components/country/Flag'
import { Button } from '@/components/ui/button'
import type { Country } from '@/types'

const GlobeView = lazy(() => import('@/components/globe/GlobeView').then((m) => ({ default: m.GlobeView })))
const NO_INSETS = { right: 0, bottom: 0 }
const noop = () => {}

/** /compare?a=DEU&b=FRA – two countries highlighted on one globe, with their indicators side by side. */
export default function ComparePage() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const { countries, byCode, status } = useCountries()
  const boundaries = useBoundaries()
  const a = byCode.get((params.get('a') ?? 'DEU').toUpperCase())
  const b = byCode.get((params.get('b') ?? 'FRA').toUpperCase())
  const [profiles, setProfiles] = useState<{ a: ProfileValue[]; b: ProfileValue[] } | null>(null)

  useDocumentMeta({
    title: a && b ? `${a.name} vs ${b.name} · World Explorer` : `${t('compare.title')} · World Explorer`,
    description: t('compare.metaDescription'),
  })

  useEffect(() => {
    if (!a || !b) return
    setProfiles(null)
    Promise.all([dataApi.profile(a.code), dataApi.profile(b.code)])
      .then(([pa, pb]) => setProfiles({ a: pa, b: pb }))
      .catch(() => setProfiles({ a: [], b: [] }))
  }, [a, b])

  const set = (key: 'a' | 'b', code: string) => {
    const next = new URLSearchParams(params)
    next.set(key, code)
    setParams(next, { replace: true })
  }

  const rows = useMemo(() => {
    if (!profiles) return []
    const byKey = new Map(profiles.b.map((p) => [p.key, p]))
    return profiles.a.filter((p) => byKey.has(p.key)).map((p) => ({ a: p, b: byKey.get(p.key)! }))
  }, [profiles])

  return (
    <PageShell title={t('compare.title')} eyebrow={t('compare.eyebrow')} wide>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <CountryPicker value={a?.code ?? ''} countries={countries} onChange={(c) => set('a', c)} label={t('compare.first')} color="#6fa8ff" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('compare.swap')}
          onClick={() => a && b && setParams({ a: b.code, b: a.code }, { replace: true })}
        >
          <ArrowLeftRight />
        </Button>
        <CountryPicker value={b?.code ?? ''} countries={countries} onChange={(c) => set('b', c)} label={t('compare.second')} color="#f6c177" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="relative h-[45vh] min-h-[300px] overflow-hidden rounded-3xl border border-border lg:h-auto lg:min-h-[560px]">
          {boundaries.status === 'success' && status === 'ready' && a && b ? (
            <Suspense fallback={<div className="skeleton absolute inset-0" />}>
              <GlobeView
                boundaries={boundaries.data}
                countries={byCode}
                mode="political"
                values={null}
                metric={INDICATORS.population}
                selected={a.code}
                secondary={b.code}
                onSelect={(code) => set('b', code)}
                onReady={noop}
                onPoseChange={noop}
                initialPose={null}
                insets={NO_INSETS}
              />
            </Suspense>
          ) : (
            <div className="skeleton absolute inset-0" />
          )}
          <p className="pointer-events-none absolute bottom-3 left-4 text-xs text-muted-foreground">{t('compare.globeHint')}</p>
        </div>

        {a && b && (
          <Card>
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1 border-b border-border pb-4">
              <span />
              <CountryHead country={a} color="#6fa8ff" />
              <CountryHead country={b} color="#f6c177" />
            </div>
            <dl className="divide-y divide-border text-sm">
              <Row label={t('compare.capital')} a={a.capital[0] ?? '—'} b={b.capital[0] ?? '—'} />
              <Row label={t('compare.region')} a={a.subregion ?? a.region} b={b.subregion ?? b.region} />
              <Row label={t('compare.area')} a={formatArea(a.area)} b={formatArea(b.area)} bars={[a.area ?? 0, b.area ?? 0]} />
              <Row label={t('compare.languages')} a={a.languages.slice(0, 2).join(', ') || '—'} b={b.languages.slice(0, 2).join(', ') || '—'} />
              {rows.map(({ a: pa, b: pb }) => {
                const meta = INDICATORS[pa.key as IndicatorKey]
                const label = t(`indicator.${pa.key}` as MessageKey) === `indicator.${pa.key}` ? (meta?.short ?? pa.label) : t(`indicator.${pa.key}` as MessageKey)
                return (
                  <Row
                    key={pa.key}
                    label={label}
                    a={meta ? meta.format(pa.value) : String(pa.value)}
                    b={meta ? meta.format(pb.value) : String(pb.value)}
                    notes={[pa.rank ? `#${pa.rank}` : '', pb.rank ? `#${pb.rank}` : '']}
                    bars={pa.value >= 0 && pb.value >= 0 ? [pa.value, pb.value] : undefined}
                  />
                )
              })}
            </dl>
            {profiles && rows.length === 0 && <p className="mt-4 text-xs text-muted-foreground">{t('compare.noData')}</p>}
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <Link to={`/countries/${a.code}`} className="text-primary hover:underline">{a.name} →</Link>
              <Link to={`/countries/${b.code}`} className="text-primary hover:underline">{b.name} →</Link>
            </div>
          </Card>
        )}
      </div>
    </PageShell>
  )
}

function CountryHead({ country, color }: { country: Country; color: string }) {
  return (
    <div className="flex w-28 flex-col items-end gap-1.5 text-right sm:w-36">
      <Flag code={country.code} name={country.name} className="h-6 w-8" />
      <span className="truncate text-sm font-medium" style={{ color }}>{country.name}</span>
    </div>
  )
}

function Row({ label, a, b, notes, bars }: { label: string; a: string; b: string; notes?: [string, string] | string[]; bars?: [number, number] | number[] }) {
  const max = bars ? Math.max(bars[0], bars[1], 1e-9) : 0
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      {[a, b].map((value, i) => (
        <dd key={i} className="w-28 text-right sm:w-36">
          <span className="tabular">{value}</span>
          {notes?.[i] && <span className="ml-1.5 text-[11px] text-muted-foreground">{notes[i]}</span>}
          {bars && (
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/5">
              <span
                className="block h-full rounded-full"
                style={{ width: `${(bars[i] / max) * 100}%`, background: i === 0 ? '#6fa8ff' : '#f6c177', marginLeft: 'auto' }}
              />
            </span>
          )}
        </dd>
      ))}
    </div>
  )
}

function CountryPicker({ value, countries, onChange, label, color }: { value: string; countries: Country[]; onChange: (code: string) => void; label: string; color: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 max-w-[14rem] rounded-full border border-input bg-background px-4 text-sm outline-none focus:border-primary"
      >
        {[...countries].sort((x, y) => x.name.localeCompare(y.name)).map((c) => (
          <option key={c.code} value={c.code}>{c.name}</option>
        ))}
      </select>
    </label>
  )
}
