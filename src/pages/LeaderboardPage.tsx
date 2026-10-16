import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Crown, Flame } from 'lucide-react'
import { activityApi, quizApi, type FeedItem, type Leaderboard, type Period } from '@/lib/backend'
import { useAuth } from '@/store/auth'
import { useDocumentMeta } from '@/hooks/useMisc'
import { Card, EmptyHint, ErrorText, PageShell } from '@/components/layout/PageShell'
import { Chip } from '@/pages/QuizPage'
import { cn } from '@/lib/utils'

const PERIODS: { id: Period; label: string; unit: string }[] = [
  { id: 'weekly', label: 'This week', unit: 'points' },
  { id: 'daily', label: "Today's challenge", unit: 'points' },
  { id: 'alltime', label: 'All time', unit: 'points' },
  { id: 'multiplayer', label: 'Match wins', unit: 'wins' },
]

export default function LeaderboardPage() {
  useDocumentMeta({ title: 'Leaderboard · World Explorer', description: 'The best geo quiz players.' })
  const me = useAuth((s) => s.user)
  const [period, setPeriod] = useState<Period>('weekly')
  const [board, setBoard] = useState<Leaderboard | null>(null)
  const [feed, setFeed] = useState<FeedItem[] | null>(null)
  const [popular, setPopular] = useState<{ code: string; name: string; count: number }[]>([])
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    setBoard(null)
    quizApi.leaderboard(period).then(setBoard).catch(setError)
  }, [period])

  // the live feed polls the activity log (Kafka → Elasticsearch)
  useEffect(() => {
    const load = () => {
      activityApi.recent(15).then(setFeed).catch(() => setFeed((f) => f ?? []))
      activityApi.popular().then((p) => setPopular(p.mostActive)).catch(() => {})
    }
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  const unit = PERIODS.find((p) => p.id === period)!.unit

  return (
    <PageShell title="Leaderboard" eyebrow="Hall of fame">
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <Chip key={p.id} active={period === p.id} onClick={() => setPeriod(p.id)}>
                {p.label}
              </Chip>
            ))}
          </div>
          {board && board.top.length === 0 && <EmptyHint>Nobody on the board yet. Be the first!</EmptyHint>}
          <ol className="mt-4 divide-y divide-border">
            {board?.top.map((e) => (
              <li
                key={e.userId}
                className={cn('flex items-center gap-4 py-3', e.userId === me?.id && 'rounded-xl bg-primary/10 px-3')}
              >
                <span className={cn('tabular w-8 text-right text-lg', e.rank <= 3 ? 'text-amber-300' : 'text-muted-foreground')}>
                  {e.rank}
                </span>
                {e.rank === 1 && <Crown className="size-4 text-amber-300" />}
                <span className="flex-1 truncate">{e.name}</span>
                <span className="tabular font-medium">
                  {e.score.toLocaleString('en')} <span className="text-xs text-muted-foreground">{unit}</span>
                </span>
              </li>
            ))}
          </ol>
          {board?.me && !board.top.some((e) => e.userId === me?.id) && (
            <p className="mt-4 rounded-xl bg-white/5 px-3 py-2 text-sm">
              You are #{board.me.rank} with {board.me.score.toLocaleString('en')} {unit}
            </p>
          )}
          <p className="mt-6 text-xs text-muted-foreground">
            Classic games with default settings and the daily challenge are ranked. <Link to="/quiz" className="text-primary hover:underline">Play now</Link>
          </p>
          <ErrorText error={error} />
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <p className="eyebrow mb-3 flex items-center gap-2">
              <Activity className="size-4 text-primary" /> Live activity
            </p>
            {feed === null && <div className="skeleton h-24" />}
            {feed?.length === 0 && <EmptyHint>Nothing happened yet.</EmptyHint>}
            <ul className="grid gap-3 text-sm">
              {feed?.map((f) => (
                <li key={f.id} className="animate-fade">
                  <p>{f.summary}</p>
                  <p className="text-xs text-muted-foreground">{timeAgo(f.at)}</p>
                </li>
              ))}
            </ul>
          </Card>
          {popular.length > 0 && (
            <Card>
              <p className="eyebrow mb-3 flex items-center gap-2">
                <Flame className="size-4 text-primary" /> Trending countries
              </p>
              <ul className="grid gap-2 text-sm">
                {popular.map((p) => (
                  <li key={p.code} className="flex justify-between">
                    <Link to={`/countries/${p.code}`} className="hover:underline">{p.name}</Link>
                    <span className="tabular text-muted-foreground">{p.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </PageShell>
  )
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short' })
}
