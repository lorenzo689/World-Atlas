import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Globe2, Heart, Link2, MapPinned, NotebookPen, Search, Star, Trash2 } from 'lucide-react'
import { ApiError } from '@/lib/api'
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
import { useCountries } from '@/hooks/useCountries'
import { useDocumentMeta } from '@/hooks/useMisc'
import { useExplorer } from '@/store/explorer'
import { Card, EmptyHint, ErrorText, PageShell, RequireUser } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { Chip } from '@/pages/QuizPage'
import { cn } from '@/lib/utils'

type Tab = 'travel' | 'favorites' | 'notes' | 'views'

export default function AtlasPage() {
  useDocumentMeta({ title: 'My atlas · World Explorer', description: 'Your travels, favourite countries, notes and saved globe views.' })
  return (
    <RequireUser account>
      <Atlas />
    </RequireUser>
  )
}

function Atlas() {
  const [tab, setTab] = useState<Tab>('travel')
  const [stats, setStats] = useState<AtlasStats | null>(null)
  const refreshStats = useCallback(() => atlasApi.stats().then(setStats).catch(() => {}), [])
  useEffect(() => {
    refreshStats()
  }, [refreshStats])

  return (
    <PageShell title="My atlas" eyebrow="Personal">
      {stats && <StatsHeader stats={stats} />}
      <div className="mb-6 mt-8 flex flex-wrap gap-2">
        {(
          [
            ['travel', 'Travel log', MapPinned],
            ['favorites', 'Favourites', Heart],
            ['notes', 'Notes', NotebookPen],
            ['views', 'Saved views', Globe2],
          ] as const
        ).map(([id, label, Icon]) => (
          <Chip key={id} active={tab === id} onClick={() => setTab(id)}>
            <span className="flex items-center gap-1.5">
              <Icon className="size-3.5" /> {label}
            </span>
          </Chip>
        ))}
      </div>
      {tab === 'travel' && <TravelTab onChange={refreshStats} />}
      {tab === 'favorites' && <FavoritesTab onChange={refreshStats} />}
      {tab === 'notes' && <NotesTab onChange={refreshStats} />}
      {tab === 'views' && <ViewsTab />}
    </PageShell>
  )
}

function StatsHeader({ stats }: { stats: AtlasStats }) {
  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <Card>
        <p className="eyebrow">Countries visited</p>
        <p className="tabular mt-2 font-serif text-6xl">{stats.visited}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {stats.percentOfWorld}% of {stats.totalCountries} · {stats.lived} lived in · {stats.wishlist} on the wishlist
        </p>
      </Card>
      <Card>
        <p className="eyebrow mb-4">By region</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(stats.byRegion).map(([region, p]) => (
            <div key={region}>
              <div className="flex justify-between text-sm">
                <span>{region}</span>
                <span className="tabular text-muted-foreground">
                  {p.visited}/{p.total}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(p.visited / Math.max(1, p.total)) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/** Country picker with the frontend's country list (no request needed). */
function CountrySelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const { countries } = useCountries()
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 rounded-full border border-input bg-background px-4 text-sm outline-none focus:border-primary"
    >
      <option value="">Choose a country…</option>
      {countries.map((c) => (
        <option key={c.code} value={c.code}>
          {c.flagEmoji} {c.name}
        </option>
      ))}
    </select>
  )
}

const STATUS_LABEL: Record<TravelStatus, string> = { VISITED: 'Visited', LIVED: 'Lived there', WISHLIST: 'Wishlist' }

function TravelTab({ onChange }: { onChange: () => void }) {
  const [entries, setEntries] = useState<TravelEntry[] | null>(null)
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<TravelStatus>('VISITED')
  const [date, setDate] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [error, setError] = useState<unknown>(null)
  const load = () => atlasApi.travel().then(setEntries).catch(setError)
  useEffect(() => {
    load()
  }, [])

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
      await load()
      onChange()
    } catch (e) {
      setError(e)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card>
        {entries?.length === 0 && <EmptyHint>No trips yet. Add the first country on the right.</EmptyHint>}
        <ul className="divide-y divide-border">
          {entries?.map((t) => (
            <li key={t.code} className="flex items-center gap-3 py-3">
              <span className="text-2xl">{t.flagEmoji}</span>
              <div className="min-w-0 flex-1">
                <Link to={`/countries/${t.code}`} className="hover:underline">{t.name}</Link>
                <p className="text-xs text-muted-foreground">
                  {STATUS_LABEL[t.status]}
                  {t.visitedOn && ` · ${new Date(t.visitedOn).toLocaleDateString('en', { month: 'short', year: 'numeric' })}`}
                </p>
              </div>
              {t.rating && (
                <span className="flex">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="size-3.5 fill-amber-300 text-amber-300" />
                  ))}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${t.name}`}
                onClick={async () => {
                  await atlasApi.removeTravel(t.code)
                  await load()
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
        <p className="eyebrow mb-3">Add or update</p>
        <div className="flex flex-col gap-3">
          <CountrySelect value={code} onChange={setCode} />
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(STATUS_LABEL) as TravelStatus[]).map((s) => (
              <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</Chip>
            ))}
          </div>
          {status !== 'WISHLIST' && (
            <>
              <input
                type="date"
                value={date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDate(e.target.value)}
                className="h-10 rounded-full border border-input bg-background px-4 text-sm"
              />
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setRating(rating === n ? null : n)} aria-label={`${n} stars`}>
                    <Star className={cn('size-6', rating && n <= rating ? 'fill-amber-300 text-amber-300' : 'text-muted-foreground')} />
                  </button>
                ))}
              </div>
            </>
          )}
          <Button onClick={save} disabled={!code}>Save</Button>
          <ErrorText error={error} />
        </div>
      </Card>
    </div>
  )
}

function FavoritesTab({ onChange }: { onChange: () => void }) {
  const [favs, setFavs] = useState<Favorite[] | null>(null)
  const [code, setCode] = useState('')
  const load = () => atlasApi.favorites().then(setFavs)
  useEffect(() => {
    load()
  }, [])
  return (
    <Card>
      <div className="mb-4 flex flex-wrap gap-2">
        <CountrySelect value={code} onChange={setCode} />
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
          <Heart /> Add
        </Button>
      </div>
      {favs?.length === 0 && <EmptyHint>No favourites yet. Tip: use the heart in the globe's country panel.</EmptyHint>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {favs?.map((f) => (
          <li key={f.code} className="flex items-center gap-3 rounded-2xl border border-border p-3">
            <span className="text-2xl">{f.flagEmoji}</span>
            <Link to={`/countries/${f.code}`} className="flex-1 truncate hover:underline">{f.name}</Link>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${f.name} from favourites`}
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
    const t = setTimeout(() => atlasApi.searchNotes(query).then(setHits).catch(() => setHits([])), 250)
    return () => clearTimeout(t)
  }, [query])

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Card>
        <div className="flex gap-2">
          <label className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your notes (typo-tolerant)"
              className="h-10 w-full rounded-full border border-input bg-white/[0.03] pl-10 pr-4 text-sm outline-none focus:border-primary"
            />
          </label>
          <Button onClick={() => setEditing('new')}>New</Button>
        </div>
        {hits ? (
          <ul className="mt-4 divide-y divide-border">
            {hits.length === 0 && <EmptyHint>No matches.</EmptyHint>}
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className="w-full py-3 text-left"
                  onClick={() => setEditing(notes?.find((n) => n.id === h.id) ?? null)}
                >
                  <p className="font-medium">{h.title}</p>
                  <p className="text-xs text-muted-foreground">{h.countryName}</p>
                  {/* the snippet only contains <mark> tags added by Elasticsearch around the user's own text */}
                  <p className="mt-1 text-sm text-foreground/80 [&_mark]:rounded [&_mark]:bg-primary/30 [&_mark]:text-foreground" dangerouslySetInnerHTML={{ __html: escapeExceptMark(h.snippet) }} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {notes?.length === 0 && <EmptyHint>No notes yet.</EmptyHint>}
            {notes?.map((n) => (
              <li key={n.id}>
                <button type="button" className="w-full py-3 text-left" onClick={() => setEditing(n)}>
                  <p className="font-medium">{n.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {n.countryName} · {new Date(n.updatedAt).toLocaleDateString('en')}
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
      if (e instanceof ApiError && e.code === 'stale_version') {
        setError(new Error('This note was changed in another tab. Reload it before saving.'))
      } else setError(e)
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-3">
        {!note && <CountrySelect value={country} onChange={setCountry} />}
        {note && <p className="eyebrow">{note.countryName} · version {note.version}</p>}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          maxLength={140}
          className="h-11 rounded-xl border border-input bg-white/[0.03] px-3.5 text-lg outline-none focus:border-primary"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          placeholder="What do you remember, plan or want to look up?"
          className="scrollbar-thin rounded-xl border border-input bg-white/[0.03] p-3.5 text-sm leading-relaxed outline-none focus:border-primary"
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={!title.trim() || (!note && !country)}>Save</Button>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
          {note && (
            <Button
              variant="ghost"
              className="ml-auto text-destructive"
              onClick={async () => {
                await atlasApi.deleteNote(note.id)
                onDone()
              }}
            >
              <Trash2 /> Delete
            </Button>
          )}
        </div>
        <ErrorText error={error} />
      </div>
    </Card>
  )
}

function ViewsTab() {
  const [views, setViews] = useState<SavedView[] | null>(null)
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
          No saved views. On the <Link to="/" className="text-primary hover:underline">globe</Link>, use “Save view” to keep a camera angle and mode.
        </EmptyHint>
      )}
      <ul className="divide-y divide-border">
        {views?.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p>{v.name}</p>
              <p className="text-xs text-muted-foreground">
                {v.mode}
                {v.metric && ` · ${v.metric}`} · {v.isPublic ? 'public' : 'private'}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => { openView(v); navigate('/') }}>
              <Globe2 /> Open
            </Button>
            {v.isPublic && (
              <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/views/${v.slug}`)}>
                <Link2 /> Copy link
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete view"
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

function escapeExceptMark(html: string) {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;mark&gt;/g, '<mark>')
    .replace(/&lt;\/mark&gt;/g, '</mark>')
}
