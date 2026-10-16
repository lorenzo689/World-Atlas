import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  Area,
  ComposedChart,
} from 'recharts'
import { Database, Play, RefreshCw, Server } from 'lucide-react'
import {
  activityApi,
  dataApi,
  type Correlation,
  type CountrySeries,
  type DayBucket,
  type IndicatorInfo,
  type IndicatorStats,
  type IngestionRun,
  type Overview,
  type RankingEntry,
  type TrendPoint,
} from '@/lib/backend'
import { INDICATORS, type IndicatorKey } from '@/lib/indicators'
import { REGION_COLORS } from '@/lib/color'
import { isAdmin, useAuth } from '@/store/auth'
import { useCountries } from '@/hooks/useCountries'
import { useDocumentMeta } from '@/hooks/useMisc'
import { Card, EmptyHint, ErrorText, PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { Chip } from '@/pages/QuizPage'
import { cn } from '@/lib/utils'

const SERIES_COLORS = ['#6fa8ff', '#f6c177', '#9ccfd8', '#eb6f92', '#c4a7e7', '#a3be8c']
const axis = { stroke: 'rgba(160,190,235,0.35)', fontSize: 11 }
const tooltipStyle = {
  contentStyle: { background: 'rgba(10,16,26,0.92)', border: '1px solid rgba(160,190,235,0.18)', borderRadius: 12, fontSize: 12 },
  labelStyle: { color: '#8a97ab' },
}

const fmt = (key: string) => (INDICATORS[key as IndicatorKey]?.format ?? ((v: number | null | undefined) => String(v)))
const tick = (key: string) => (INDICATORS[key as IndicatorKey]?.tick ?? ((v: number) => String(v)))

export default function DataPage() {
  useDocumentMeta({ title: 'Data platform · World Explorer', description: 'World Bank indicators ingested through Kafka into PostgreSQL.' })
  const user = useAuth((s) => s.user)
  const [catalog, setCatalog] = useState<IndicatorInfo[] | null>(null)
  const [key, setKey] = useState<string>('gdpPerCapita')
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    dataApi.catalog().then(setCatalog).catch(setError)
  }, [])

  const info = catalog?.find((c) => c.key === key)
  const empty = catalog && catalog.every((c) => c.coverage.observations === 0)

  return (
    <PageShell title="Data platform" eyebrow="World Bank → Kafka → PostgreSQL" wide>
      {empty && (
        <Card className="mb-6">
          <p className="text-sm">
            No data ingested yet. The backend starts a full ingestion on first launch (needs internet); admins can also trigger it below.
          </p>
        </Card>
      )}
      <div className="mb-6 flex flex-wrap gap-2">
        {catalog?.map((c) => (
          <Chip key={c.key} active={key === c.key} onClick={() => setKey(c.key)}>
            {INDICATORS[c.key as IndicatorKey]?.short ?? c.key}
          </Chip>
        ))}
      </div>
      {info && (
        <p className="mb-6 text-sm text-muted-foreground">
          {info.label} · {info.coverage.countries} countries · {info.coverage.observations.toLocaleString('en')} observations
          {info.coverage.fromYear && ` · ${info.coverage.fromYear}–${info.coverage.toYear}`}
        </p>
      )}
      <ErrorText error={error} />

      <div className="grid gap-6 lg:grid-cols-2">
        <TrendCard indicator={key} />
        <StatsCard indicator={key} />
        <RankingCard indicator={key} />
        <CompareCard indicator={key} />
      </div>
      <div className="mt-6">
        <CorrelationCard />
      </div>
      {isAdmin(user) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <IngestionCard catalog={catalog ?? []} />
          <OverviewCard />
        </div>
      )}
    </PageShell>
  )
}

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let alive = true
    setData(null)
    load()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, error }
}

function TrendCard({ indicator }: { indicator: string }) {
  const { data } = useLoad<TrendPoint[]>(() => dataApi.trend(indicator), [indicator])
  const rows = data?.map((p) => ({ ...p, band: [p.min, p.max] }))
  return (
    <Card>
      <p className="eyebrow mb-1">World trend</p>
      <p className="mb-4 text-xs text-muted-foreground">Median across countries per year (SQL percentile_cont), with the mean</p>
      <div className="h-64">
        {rows && rows.length > 0 ? (
          <ResponsiveContainer>
            <ComposedChart data={rows}>
              <CartesianGrid stroke="rgba(160,190,235,0.08)" vertical={false} />
              <XAxis dataKey="year" {...axis} />
              <YAxis tickFormatter={tick(indicator)} width={64} {...axis} />
              <Tooltip {...tooltipStyle} formatter={(v) => fmt(indicator)(Number(v))} />
              <Area dataKey="median" stroke="none" fill="rgba(111,168,255,0.12)" />
              <Line dataKey="median" stroke="#6fa8ff" dot={false} strokeWidth={2} name="Median" />
              <Line dataKey="mean" stroke="#f6c177" dot={false} strokeWidth={1.5} strokeDasharray="4 3" name="Mean" />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="skeleton h-full" />
        )}
      </div>
    </Card>
  )
}

function StatsCard({ indicator }: { indicator: string }) {
  const { data } = useLoad<IndicatorStats>(() => dataApi.stats(indicator), [indicator])
  const f = fmt(indicator)
  const items: [string, number | null][] = data
    ? [
        ['Minimum', data.min],
        ['25th percentile', data.p25],
        ['Median', data.median],
        ['75th percentile', data.p75],
        ['Maximum', data.max],
        ['Mean', data.mean],
      ]
    : []
  return (
    <Card>
      <p className="eyebrow mb-1">Distribution of the latest values</p>
      <p className="mb-4 text-xs text-muted-foreground">
        {data ? `${data.countries} countries, latest year ${data.latestYear ?? '—'}` : 'Loading…'}
      </p>
      {data && data.min != null && data.max != null && (
        <BoxPlot min={data.min} p25={data.p25!} median={data.median!} p75={data.p75!} max={data.max} />
      )}
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map(([label, v]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="tabular">{f(v)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

/** A horizontal box plot on a log scale when the range spans orders of magnitude. */
function BoxPlot({ min, p25, median, p75, max }: { min: number; p25: number; median: number; p75: number; max: number }) {
  const log = min > 0 && max / Math.max(min, 1e-9) > 100
  const t = (v: number) => (log ? Math.log10(v) : v)
  const lo = t(min)
  const hi = t(max)
  const x = (v: number) => `${((t(v) - lo) / Math.max(hi - lo, 1e-9)) * 100}%`
  return (
    <div className="relative h-10">
      <div className="absolute top-1/2 h-px w-full bg-white/20" />
      <div className="absolute top-1/2 h-6 -translate-y-1/2 rounded-md border border-primary/60 bg-primary/15" style={{ left: x(p25), width: `calc(${x(p75)} - ${x(p25)})` }} />
      <div className="absolute top-1/2 h-8 w-0.5 -translate-y-1/2 bg-primary" style={{ left: x(median) }} />
      {log && <span className="absolute -bottom-4 right-0 text-[10px] text-muted-foreground">log scale</span>}
    </div>
  )
}

function RankingCard({ indicator }: { indicator: string }) {
  const [order, setOrder] = useState<'desc' | 'asc'>('desc')
  const { data } = useLoad<RankingEntry[]>(() => dataApi.ranking(indicator, order, 12), [indicator, order])
  const f = fmt(indicator)
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <p className="eyebrow">Ranking (SQL window function)</p>
        <div className="flex gap-1.5">
          <Chip active={order === 'desc'} onClick={() => setOrder('desc')}>Highest</Chip>
          <Chip active={order === 'asc'} onClick={() => setOrder('asc')}>Lowest</Chip>
        </div>
      </div>
      <ol className="grid gap-1.5 text-sm">
        {data?.map((r) => (
          <li key={r.code} className="flex items-center gap-3">
            <span className="tabular w-6 text-right text-muted-foreground">{r.rank}</span>
            <Link to={`/countries/${r.code}`} className="flex-1 truncate hover:underline">{r.name}</Link>
            <span className="text-xs text-muted-foreground">{r.year}</span>
            <span className="tabular w-28 text-right">{f(r.value)}</span>
          </li>
        ))}
      </ol>
      {data?.length === 0 && <EmptyHint>No data.</EmptyHint>}
    </Card>
  )
}

function CompareCard({ indicator }: { indicator: string }) {
  const { countries } = useCountries()
  const [codes, setCodes] = useState<string[]>(['DEU', 'USA', 'CHN', 'IND'])
  const [add, setAdd] = useState('')
  const { data } = useLoad<{ series: CountrySeries[] }>(() => dataApi.series(indicator, codes), [indicator, codes.join(',')])
  const rows = useMemo(() => {
    const byYear = new Map<number, Record<string, number>>()
    data?.series.forEach((s) =>
      s.points.forEach((p) => byYear.set(p.year, { ...(byYear.get(p.year) ?? { year: p.year }), [s.code]: p.value })),
    )
    return [...byYear.values()].sort((a, b) => a.year - b.year)
  }, [data])

  return (
    <Card>
      <p className="eyebrow mb-3">Compare countries</p>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {codes.map((c, i) => (
          <button
            key={c}
            type="button"
            onClick={() => codes.length > 1 && setCodes(codes.filter((x) => x !== c))}
            className="rounded-full border px-2.5 py-1 text-xs"
            style={{ borderColor: SERIES_COLORS[i % SERIES_COLORS.length], color: SERIES_COLORS[i % SERIES_COLORS.length] }}
            title="Remove"
          >
            {countries.find((x) => x.code === c)?.name ?? c} ×
          </button>
        ))}
        {codes.length < 6 && (
          <select
            value={add}
            onChange={(e) => {
              if (e.target.value && !codes.includes(e.target.value)) setCodes([...codes, e.target.value])
              setAdd('')
            }}
            className="h-7 rounded-full border border-input bg-background px-2 text-xs"
          >
            <option value="">+ add</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        )}
      </div>
      <div className="h-56">
        <ResponsiveContainer>
          <LineChart data={rows}>
            <CartesianGrid stroke="rgba(160,190,235,0.08)" vertical={false} />
            <XAxis dataKey="year" {...axis} />
            <YAxis tickFormatter={tick(indicator)} width={64} {...axis} />
            <Tooltip {...tooltipStyle} formatter={(v) => fmt(indicator)(Number(v))} />
            {codes.map((c, i) => (
              <Line key={c} dataKey={c} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} dot={false} strokeWidth={2} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function CorrelationCard() {
  const [x, setX] = useState('gdpPerCapita')
  const [y, setY] = useState('lifeExpectancy')
  const { data } = useLoad<Correlation>(() => dataApi.correlation(x, y), [x, y])
  const logX = x === 'gdpPerCapita' || x === 'gdp' || x === 'population' || x === 'density'
  const select = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-full border border-input bg-background px-3 text-sm">
      {Object.values(INDICATORS).map((m) => (
        <option key={m.key} value={m.key}>{m.short}</option>
      ))}
    </select>
  )
  const byRegion = useMemo(() => {
    const groups = new Map<string, Correlation['points']>()
    data?.points.forEach((p) => groups.set(p.region, [...(groups.get(p.region) ?? []), p]))
    return [...groups.entries()]
  }, [data])

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="eyebrow">Correlation</p>
        {select(x, setX)}
        <span className="text-muted-foreground">vs</span>
        {select(y, setY)}
        {data && (
          <span className="ml-auto text-sm">
            Pearson r = <strong className="tabular">{data.pearsonR?.toFixed(3) ?? '—'}</strong>
            <span className="text-muted-foreground"> · n = {data.n} (PostgreSQL corr())</span>
          </span>
        )}
      </div>
      <div className="h-80">
        <ResponsiveContainer>
          <ScatterChart>
            <CartesianGrid stroke="rgba(160,190,235,0.08)" />
            <XAxis type="number" dataKey="x" name={x} scale={logX ? 'log' : 'auto'} domain={logX ? ['auto', 'auto'] : undefined} tickFormatter={tick(x)} {...axis} />
            <YAxis type="number" dataKey="y" name={y} tickFormatter={tick(y)} width={64} {...axis} />
            <ZAxis range={[28, 28]} />
            <Tooltip
              {...tooltipStyle}
              content={({ payload }) => {
                const p = payload?.[0]?.payload as Correlation['points'][number] | undefined
                if (!p) return null
                return (
                  <div className="glass rounded-xl px-3 py-2 text-xs">
                    <p className="font-medium">{p.name}</p>
                    <p>{INDICATORS[x as IndicatorKey]?.short}: {fmt(x)(p.x)}</p>
                    <p>{INDICATORS[y as IndicatorKey]?.short}: {fmt(y)(p.y)}</p>
                  </div>
                )
              }}
            />
            {byRegion.map(([region, pts]) => (
              <Scatter key={region} name={region} data={pts} fill={REGION_COLORS[region] ?? '#8a97ab'} fillOpacity={0.8} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function IngestionCard({ catalog }: { catalog: IndicatorInfo[] }) {
  const [runs, setRuns] = useState<IngestionRun[]>([])
  const load = () => dataApi.runs().then(setRuns).catch(() => {})
  useEffect(() => {
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [])
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <p className="eyebrow flex items-center gap-2">
          <Database className="size-4 text-primary" /> Ingestion runs (admin)
        </p>
        <Button size="sm" variant="outline" onClick={() => dataApi.ingest().then(load)}>
          <Play /> Ingest all
        </Button>
      </div>
      <ul className="scrollbar-thin grid max-h-80 gap-1.5 overflow-y-auto text-sm">
        {runs.map((r) => (
          <li key={r.id} className="flex items-center gap-3">
            <span
              className={cn(
                'w-24 rounded-full px-2 py-0.5 text-center text-[11px]',
                r.status === 'COMPLETED' && 'bg-emerald-400/15 text-emerald-300',
                r.status === 'FAILED' && 'bg-destructive/15 text-destructive',
                (r.status === 'FETCHING' || r.status === 'PUBLISHED') && 'bg-primary/15 text-primary',
              )}
              title={r.error ?? undefined}
            >
              {r.status}
            </span>
            <span className="flex-1 truncate">{r.indicatorKey}</span>
            <span className="tabular text-xs text-muted-foreground">
              {r.stored.toLocaleString('en')}/{r.fetched.toLocaleString('en')}
            </span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Re-ingest ${r.indicatorKey}`}
              onClick={() => dataApi.ingest(r.indicatorKey).then(load).catch(() => {})}
            >
              <RefreshCw className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      {runs.length === 0 && <EmptyHint>No runs yet ({catalog.length} indicators available).</EmptyHint>}
    </Card>
  )
}

function OverviewCard() {
  const [o, setO] = useState<Overview | null>(null)
  const [days, setDays] = useState<DayBucket[]>([])
  useEffect(() => {
    const load = () => {
      activityApi.overview().then(setO).catch(() => {})
      activityApi.perDay(14).then(setDays).catch(() => {})
    }
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])
  const totalLag = o?.kafkaLag.reduce((s, l) => s + l.lag, 0) ?? 0
  return (
    <Card>
      <p className="eyebrow mb-4 flex items-center gap-2">
        <Server className="size-4 text-primary" /> System overview (admin)
      </p>
      {o && (
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <Block title="PostgreSQL" rows={o.postgres} />
          <Block title="Elasticsearch" rows={o.elasticsearch} />
          <Block title="Redis" rows={o.redis} />
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Kafka consumer lag</p>
            <p className={cn('tabular text-2xl', totalLag > 0 ? 'text-amber-300' : 'text-emerald-300')}>{totalLag}</p>
            <ul className="mt-1 text-[11px] text-muted-foreground">
              {o.kafkaLag.filter((l) => l.lag > 0).map((l) => (
                <li key={l.group + l.topic}>{l.group} · {l.topic}: {l.lag}</li>
              ))}
            </ul>
            {o.kafkaError && <p className="text-xs text-destructive">{o.kafkaError}</p>}
          </div>
        </div>
      )}
      {days.length > 0 && (
        <div className="mt-5 h-36">
          <p className="mb-1 text-xs text-muted-foreground">Events per day (Elasticsearch date_histogram)</p>
          <ResponsiveContainer>
            <ComposedChart data={days}>
              <XAxis dataKey="day" {...axis} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis width={32} {...axis} />
              <Tooltip {...tooltipStyle} />
              <Area dataKey="total" stroke="#6fa8ff" fill="rgba(111,168,255,0.2)" name="Events" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function Block({ title, rows }: { title: string; rows: Record<string, number> }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{title}</p>
      <dl className="grid gap-0.5">
        {Object.entries(rows).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="tabular">{v === -1 ? '—' : Number(v).toLocaleString('en')}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
