import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Globe2, Heart, Link2, MailWarning, MapPinned, NotebookPen, Search, Share2, Star, Trash2 } from 'lucide-react'
import { ApiError, authApi } from '@/lib/api'
import {
  atlasApi,
  type AtlasStats,
  type Favorite,
  type Note,
  type NoteHit,
  type SavedView,
  type TravelEntry,
  type TravelStatus,
} from '@/lib/backend'
import { useBoundaries } from '@/hooks/useBoundaries'
import { useCountries } from '@/hooks/useCountries'
import { useDocumentMeta } from '@/hooks/useMisc'
import { useExplorer } from '@/store/explorer'
import { useAuth } from '@/store/auth'
import { useLang, useT, type MessageKey } from '@/i18n'
import { INDICATORS } from '@/lib/indicators'
import { renderSnippet } from '@/lib/searchSnippet'
import { drawShareImage, shareOrDownload, TRAVEL_COLORS } from '@/lib/shareImage'
import type { CountryFeature } from '@/lib/geo'
import { Card, EmptyHint, ErrorText, PageShell, RequireUser } from '@/components/layout/PageShell'
import { Flag } from '@/components/country/Flag'
import { Button } from '@/components/ui/button'
import { Chip } from '@/pages/QuizPage'
import { cn } from '@/lib/utils'

const GlobeView = lazy(() => import('@/components/globe/GlobeView').then((m) => ({ default: m.GlobeView })))
const NO_INSETS = { right: 0, bottom: 0 }
const noop = () => {}

type Tab = 'travel' | 'favorites' | 'notes' | 'views'

export default function AtlasPage() {
  const t = useT()
  useDocumentMeta({ title: `${t('nav.atlas')} · World Explorer`, description: t('atlas.metaDescription') })
  return (
    <RequireUser account>
      <Atlas />
    </RequireUser>
  )
}

function Atlas() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('travel')
  const [stats, setStats] = useState<AtlasStats | null>(null)
  const [travel, setTravel] = useState<TravelEntry[] | null>(null)
  const refresh = useCallback(() => {
    atlasApi.stats().then(setStats).catch(() => {})
    atlasApi.travel().then(setTravel).catch(() => {})
  }, [])
  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <PageShell title={t('nav.atlas')} eyebrow={t('atlas.eyebrow')} wide>
      <VerifyBanner />
      {stats && <StatsHeader stats={stats} travel={travel ?? []} />}
      <div className="mb-6 mt-8 flex flex-wrap gap-2" role="tablist" aria-label={t('nav.atlas')}>
        {(
          [
            ['travel', t('atlas.tab.travel'), MapPinned],
            ['favorites', t('atlas.tab.favorites'), Heart],
            ['notes', t('atlas.tab.notes'), NotebookPen],
            ['views', t('atlas.tab.views'), Globe2],
          ] as const
        ).map(([id, label, Icon]) => (
          <Chip key={id} active={tab === id} onClick={() => setTab(id)}>
            <span className="flex items-center gap-1.5">
              <Icon className="size-3.5" aria-hidden /> {label}
            </span>
          </Chip>
        ))}
      </div>
      {tab === 'travel' && <TravelTab entries={travel} onChange={refresh} />}
      {tab === 'favorites' && <FavoritesTab onChange={refresh} />}
      {tab === 'notes' && <NotesTab onChange={refresh} />}
      {tab === 'views' && <ViewsTab />}
    </PageShell>
  )
}

function VerifyBanner() {
  const t = useT()
  const user = useAuth((s) => s.user)
  const [sent, setSent] = useState(false)
  if (!user || user.guest || user.emailVerified) return null
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm" role="status">
      <MailWarning className="size-4 text-amber-300" aria-hidden />
      <span className="flex-1">{t('atlas.verifyBanner', { email: user.email ?? '' })}</span>
      <Button
        size="sm"
        variant="outline"
        disabled={sent}
        onClick={async () => {
          await authApi.resendVerification().catch(() => {})
          setSent(true)
        }}
      >
        {sent ? t('atlas.verifySent') : t('atlas.verifyResend')}
      </Button>
    </div>
  )
}

function StatsHeader({ stats, travel }: { stats: AtlasStats; travel: TravelEntry[] }) {
  const t = useT()
  const user = useAuth((s) => s.user)
  const boundaries = useBoundaries()
  const { byCode, status } = useCountries()
  const statusOf = useMemo(() => new Map(travel.map((e) => [e.code, e.status])), [travel])
  const paint = useCallback((code: string) => {
    const s = statusOf.get(code)
    return s ? TRAVEL_COLORS[s] : null
  }, [statusOf])
  const legend = [
    { label: t('atlas.status.VISITED'), color: TRAVEL_COLORS.VISITED },
    { label: t('atlas.status.LIVED'), color: TRAVEL_COLORS.LIVED },
    { label: t('atlas.status.WISHLIST'), color: TRAVEL_COLORS.WISHLIST },
  ]

  const share = async () => {
    if (boundaries.status !== 'success') return
    const canvas = drawShareImage({
      title: t('atlas.shareTitle', { name: user?.displayName ?? '' }),
      subtitle: t('atlas.shareSubtitle', { percent: stats.percentOfWorld, total: stats.totalCountries }),
      bigNumber: String(stats.visited),
      bigLabel: t('atlas.countriesVisited'),
      regions: Object.entries(stats.byRegion)
        .filter(([r]) => r !== 'Antarctic')
        .map(([r, p]) => ({ label: t(`region.${r}` as MessageKey), visited: p.visited, total: p.total })),
      legend,
      footer: 'World Explorer',
      colorOf: paint,
      features: boundaries.data.features as CountryFeature[],
    })
    await shareOrDownload(canvas, 'world-explorer-atlas.png', t('atlas.shareTitle', { name: user?.displayName ?? '' }))
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <div className="flex flex-col gap-6">
        <Card>
          <p className="eyebrow">{t('atlas.countriesVisited')}</p>
          <p className="tabular mt-2 font-serif text-6xl">{stats.visited}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('atlas.statsLine', { percent: stats.percentOfWorld, total: stats.totalCountries, lived: stats.lived, wishlist: stats.wishlist })}
          </p>
          <Button variant="outline" className="mt-5 w-full" onClick={share} disabled={boundaries.status !== 'success'}>
            <Share2 /> {t('atlas.shareImage')}
          </Button>
        </Card>
        <Card>
          <p className="eyebrow mb-4">{t('atlas.byRegion')}</p>
          <div className="grid gap-3">
            {Object.entries(stats.byRegion).filter(([r]) => r !== 'Antarctic').map(([region, p]) => (
              <div key={region}>
                <div className="flex justify-between text-sm">
                  <span>{t(`region.${region}` as MessageKey)}</span>
                  <span className="tabular text-muted-foreground">{p.visited}/{p.total}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.visited} aria-label={t(`region.${region}` as MessageKey)}>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(p.visited / Math.max(1, p.total)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="relative h-[50vh] min-h-[340px] overflow-hidden rounded-3xl border border-border lg:h-auto">
        {boundaries.status === 'success' && status === 'ready' ? (
          <Suspense fallback={<div className="skeleton absolute inset-0" />}>
            <GlobeView
              boundaries={boundaries.data}
              countries={byCode}
              mode="political"
              values={null}
              metric={INDICATORS.population}
              selected={null}
              onSelect={noop}
              onReady={noop}
              onPoseChange={noop}
              initialPose={{ lat: 30, lng: 10, altitude: 2.2 }}
              insets={NO_INSETS}
              paint={paint}
            />
          </Suspense>
        ) : (
          <div className="skeleton absolute inset-0" />
        )}
        <ul className="pointer-events-none absolute bottom-3 left-4 flex flex-wrap gap-3 text-xs" aria-label={t('atlas.legend')}>
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: l.color }} aria-hidden /> {l.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Country picker with the frontend's country list (no request needed). */
function CountrySelect({ value, onChange, label }: { value: string; onChange: (code: string) => void; label: string }) {
  const t = useT()
  const { countries } = useCountries()
  const sorted = useMemo(() => [...countries].sort((a, b) => a.name.localeCompare(b.name)), [countries])
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="h-10 rounded-full border border-input bg-background px-4 text-sm outline-none focus:border-primary"
    >
      <option value="">{t('atlas.chooseCountry')}</option>
      {sorted.map((c) => (
        <option key={c.code} value={c.code}>
          {c.name}
        </option>
      ))}
    </select>
  )
}

function TravelTab({ entries, onChange }: { entries: TravelEntry[] | null; onChange: () => void }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { byCode } = useCountries()
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<TravelStatus>('VISITED')
  const [date, setDate] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [error, setError] = useState<unknown>(null)

  const save = async () => {
    if (!code) return
    setError(null)
    try {
      await atlasApi.setTravel(code, {
        status,
        visitedOn: status === 'WISHLIST' ? null : date || null,
        rating: status === 'WISHLIST' ? null : rating,
      })
      setCode('')
      setDate('')
      setRating(null)
      onChange()
    } catch (e) {
      setError(e)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card>
        {entries?.length === 0 && <EmptyHint>{t('atlas.noTrips')}</EmptyHint>}
        <ul className="divide-y divide-border">
          {entries?.map((e) => (
            <li key={e.code} className="flex items-center gap-3 py-3">
              <Flag code={e.code} name="" className="h-[18px] w-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <Link to={`/countries/${e.code}`} className="hover:underline">{byCode.get(e.code)?.name ?? e.name}</Link>
                <p className="text-xs text-muted-foreground">
                  {t(`atlas.status.${e.status}`)}
                  {e.visitedOn && ` · ${new Date(e.visitedOn).toLocaleDateString(lang, { month: 'short', year: 'numeric' })}`}
                </p>
              </div>
              {e.rating && (
                <span className="flex" aria-label={t('atlas.stars', { n: e.rating })}>
                  {Array.from({ length: e.rating }).map((_, i) => (
                    <Star key={i} className="size-3.5 fill-amber-300 text-amber-300" aria-hidden />
                  ))}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('atlas.remove', { name: e.name })}
                onClick={async () => {
                  await atlasApi.removeTravel(e.code)
                  onChange()
                }}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <p className="eyebrow mb-3">{t('atlas.addOrUpdate')}</p>
        <div className="flex flex-col gap-3">
          <CountrySelect value={code} onChange={setCode} label={t('atlas.country')} />
          <div className="flex flex-wrap gap-1.5">
            {(['VISITED', 'LIVED', 'WISHLIST'] as TravelStatus[]).map((s) => (
              <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{t(`atlas.status.${s}`)}</Chip>
            ))}
          </div>
          {status !== 'WISHLIST' && (
            <>
              <input
                type="date"
                value={date}
                aria-label={t('atlas.date')}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDate(e.target.value)}
                className="h-10 rounded-full border border-input bg-background px-4 text-sm"
              />
              <div className="flex gap-1" role="radiogroup" aria-label={t('atlas.rating')}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    onClick={() => setRating(rating === n ? null : n)}
                    aria-label={t('atlas.stars', { n })}
                  >
                    <Star className={cn('size-6', rating && n <= rating ? 'fill-amber-300 text-amber-300' : 'text-muted-foreground')} aria-hidden />
                  </button>
                ))}
              </div>
            </>
          )}
          <Button onClick={save} disabled={!code}>{t('common.save')}</Button>
          <ErrorText error={error} />
        </div>
      </Card>
    </div>
  )
}

function FavoritesTab({ onChange }: { onChange: () => void }) {
  const t = useT()
  const { byCode } = useCountries()
  const [favs, setFavs] = useState<Favorite[] | null>(null)
  const [code, setCode] = useState('')
  const load = () => atlasApi.favorites().then(setFavs)
  useEffect(() => {
    load()
  }, [])
  return (
    <Card>
      <div className="mb-4 flex flex-wrap gap-2">
        <CountrySelect value={code} onChange={setCode} label={t('atlas.country')} />
        <Button
          variant="outline"
          disabled={!code}
          onClick={async () => {
            await atlasApi.addFavorite(code)
            setCode('')
            await load()
            onChange()
          }}
        >
          <Heart /> {t('atlas.add')}
        </Button>
      </div>
      {favs?.length === 0 && <EmptyHint>{t('atlas.noFavorites')}</EmptyHint>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {favs?.map((f) => (
          <li key={f.code} className="flex items-center gap-3 rounded-2xl border border-border p-3">
            <Flag code={f.code} name="" className="h-[18px] w-6 shrink-0" />
            <Link to={`/countries/${f.code}`} className="flex-1 truncate hover:underline">{byCode.get(f.code)?.name ?? f.name}</Link>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('atlas.unfavorite', { name: f.name })}
              onClick={async () => {
                await atlasApi.removeFavorite(f.code)
                await load()
                onChange()
              }}
            >
              <Heart className="fill-primary text-primary" />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function NotesTab({ onChange }: { onChange: () => void }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { byCode } = useCountries()
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<NoteHit[] | null>(null)
  const [editing, setEditing] = useState<Note | 'new' | null>(null)
  const load = () => atlasApi.notes().then(setNotes)
  useEffect(() => {
    load()
  }, [])

  // full-text search runs in Elasticsearch (debounced)
  useEffect(() => {
    if (!query.trim()) {
      setHits(null)
      return
    }
    const timer = setTimeout(() => atlasApi.searchNotes(query).then(setHits).catch(() => setHits([])), 250)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Card>
        <div className="flex gap-2">
          <label className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <span className="sr-only">{t('atlas.searchNotes')}</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('atlas.searchNotes')}
              className="h-10 w-full rounded-full border border-input bg-white/[0.03] pl-10 pr-4 text-sm outline-none focus:border-primary"
            />
          </label>
          <Button onClick={() => setEditing('new')}>{t('atlas.newNote')}</Button>
        </div>
        {hits ? (
          <ul className="mt-4 divide-y divide-border" aria-live="polite">
            {hits.length === 0 && <EmptyHint>{t('atlas.noMatches')}</EmptyHint>}
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" className="w-full py-3 text-left" onClick={() => setEditing(notes?.find((n) => n.id === h.id) ?? null)}>
                  <p className="font-medium">{h.title}</p>
                  <p className="text-xs text-muted-foreground">{byCode.get(h.countryCode)?.name ?? h.countryName}</p>
                  <p
                    className="mt-1 text-sm text-foreground/80 [&_mark]:rounded [&_mark]:bg-primary/30 [&_mark]:text-foreground"
                  >{renderSnippet(h.snippet)}</p>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {notes?.length === 0 && <EmptyHint>{t('atlas.noNotes')}</EmptyHint>}
            {notes?.map((n) => (
              <li key={n.id}>
                <button type="button" className="w-full py-3 text-left" onClick={() => setEditing(n)}>
                  <p className="font-medium">{n.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {byCode.get(n.countryCode)?.name ?? n.countryName} · {new Date(n.updatedAt).toLocaleDateString(lang)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && (
        <NoteEditor
          key={editing === 'new' ? 'new' : editing.id}
          note={editing === 'new' ? null : editing}
          onDone={async () => {
            setEditing(null)
            await load()
            onChange()
          }}
        />
      )}
    </div>
  )
}

function NoteEditor({ note, onDone }: { note: Note | null; onDone: () => void }) {
  const t = useT()
  const [country, setCountry] = useState(note?.countryCode ?? '')
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [error, setError] = useState<unknown>(null)

  const save = async () => {
    setError(null)
    try {
      if (note) await atlasApi.updateNote(note.id, { title, body, version: note.version })
      else await atlasApi.createNote({ countryCode: country, title, body })
      onDone()
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'stale_version' ? new Error(t('error.stale_version')) : e)
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-3">
        {!note && <CountrySelect value={country} onChange={setCountry} label={t('atlas.country')} />}
        {note && <p className="eyebrow">{note.countryName} · {t('atlas.version', { n: note.version })}</p>}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('atlas.noteTitle')}
          aria-label={t('atlas.noteTitle')}
          maxLength={140}
          className="h-11 rounded-xl border border-input bg-white/[0.03] px-3.5 text-lg outline-none focus:border-primary"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          placeholder={t('atlas.noteBody')}
          aria-label={t('atlas.noteBody')}
          className="scrollbar-thin rounded-xl border border-input bg-white/[0.03] p-3.5 text-sm leading-relaxed outline-none focus:border-primary"
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={!title.trim() || (!note && !country)}>{t('common.save')}</Button>
          <Button variant="ghost" onClick={onDone}>{t('common.cancel')}</Button>
          {note && (
            <Button
              variant="ghost"
              className="ml-auto text-destructive"
              onClick={async () => {
                await atlasApi.deleteNote(note.id)
                onDone()
              }}
            >
              <Trash2 /> {t('common.delete')}
            </Button>
          )}
        </div>
        <ErrorText error={error} />
      </div>
    </Card>
  )
}

function ViewsTab() {
  const t = useT()
  const [views, setViews] = useState<SavedView[] | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const navigate = useNavigate()
  const openView = useOpenView()
  const load = () => atlasApi.views().then(setViews)
  useEffect(() => {
    load()
  }, [])
  return (
    <Card>
      {views?.length === 0 && (
        <EmptyHint>
          {t('atlas.noViews')} <Link to="/" className="text-primary hover:underline">{t('nav.globe')}</Link>
        </EmptyHint>
      )}
      <ul className="divide-y divide-border">
        {views?.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p>{v.name}</p>
              <p className="text-xs text-muted-foreground">
                {t(`mode.${v.mode}`)}
                {v.metric && ` · ${v.metric}`} · {v.isPublic ? t('atlas.public') : t('atlas.private')}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => { openView(v); navigate('/explore?scenario=today&restore=1') }}>
              <Globe2 /> {t('atlas.open')}
            </Button>
            {v.isPublic && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await navigator.clipboard?.writeText(`${window.location.origin}/views/${v.slug}`)
                  setCopied(v.id)
                }}
              >
                <Link2 /> {copied === v.id ? t('common.copied') : t('atlas.copyLink')}
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('atlas.deleteView', { name: v.name })}
              onClick={async () => {
                await atlasApi.deleteView(v.id)
                load()
              }}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Applies a saved view to the explorer store (mode, metric, camera, selection). */
export function useOpenView() {
  return useMemo(
    () => (v: SavedView) => {
      const s = useExplorer.getState()
      s.setMode(v.mode)
      if (v.metric) s.setMetric(v.metric as Parameters<typeof s.setMetric>[0])
      s.setView({ lat: v.lat, lng: v.lng, altitude: v.altitude })
      s.select(v.selectedCountry)
    },
    [],
  )
}
