import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Crown, Flame } from 'lucide-react'
import { activityApi, quizApi, type FeedItem, type Leaderboard, type Period } from '@/lib/backend'
import { useAuth } from '@/store/auth'
import { useDocumentMeta } from '@/hooks/useMisc'
import { useLang, useNumberFormat, useT, type T } from '@/i18n'
import { Card, EmptyHint, ErrorText, PageShell } from '@/components/layout/PageShell'
import { Chip } from '@/pages/QuizPage'
import { cn } from '@/lib/utils'

const PERIODS: Period[] = ['weekly', 'daily', 'alltime', 'multiplayer']

export default function LeaderboardPage() {
  const t = useT()
  const fmt = useNumberFormat()
  const lang = useLang((s) => s.lang)
  useDocumentMeta({ title: `${t('nav.leaderboard')} · World Explorer`, description: t('lb.metaDescription') })
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

  const unit = period === 'multiplayer' ? t('lb.wins') : t('lb.points')

  return (
    <PageShell title={t('nav.leaderboard')} eyebrow={t('lb.eyebrow')}>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('lb.period')}>
            {PERIODS.map((p) => (
              <Chip key={p} active={period === p} onClick={() => setPeriod(p)}>
                {t(`lb.period.${p}`)}
              </Chip>
            ))}
          </div>
          {board && board.top.length === 0 && <EmptyHint>{t('lb.empty')}</EmptyHint>}
          {!board && <div className="skeleton mt-4 h-40" />}
          <ol className="mt-4 divide-y divide-border">
            {board?.top.map((e) => (
              <li key={e.userId} className={cn('flex items-center gap-4 py-3', e.userId === me?.id && 'rounded-xl bg-primary/10 px-3')}>
                <span className={cn('tabular w-8 text-right text-lg', e.rank <= 3 ? 'text-amber-300' : 'text-muted-foreground')}>{e.rank}</span>
                {e.rank === 1 && <Crown className="size-4 text-amber-300" aria-label={t('common.winner')} />}
                <span className="flex-1 truncate">{e.name}</span>
                <span className="tabular font-medium">
                  {fmt(e.score)} <span className="text-xs text-muted-foreground">{unit}</span>
                </span>
              </li>
            ))}
          </ol>
          {board?.me && !board.top.some((e) => e.userId === me?.id) && (
            <p className="mt-4 rounded-xl bg-white/5 px-3 py-2 text-sm">{t('lb.yourRank', { rank: board.me.rank, score: fmt(board.me.score), unit })}</p>
          )}
          <p className="mt-6 text-xs text-muted-foreground">
            {t('lb.rankedHint')} <Link to="/quiz" className="text-primary hover:underline">{t('lb.playNow')}</Link>
          </p>
          <ErrorText error={error} />
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <p className="eyebrow mb-3 flex items-center gap-2">
              <Activity className="size-4 text-primary" /> {t('lb.live')}
            </p>
            {feed === null && <div className="skeleton h-24" />}
            {feed?.length === 0 && <EmptyHint>{t('lb.noActivity')}</EmptyHint>}
            <ul className="grid gap-3 text-sm" aria-live="polite">
              {feed?.map((f) => (
                <li key={f.id} className="animate-fade">
                  <p>{f.summary}</p>
                  <p className="text-xs text-muted-foreground">{timeAgo(f.at, t, lang)}</p>
                </li>
              ))}
            </ul>
          </Card>
          {popular.length > 0 && (
            <Card>
              <p className="eyebrow mb-3 flex items-center gap-2">
                <Flame className="size-4 text-primary" /> {t('lb.trending')}
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

export function timeAgo(iso: string, t: T, lang: string) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return t('time.justNow')
  if (s < 3600) return t('time.minutesAgo', { n: Math.round(s / 60) })
  if (s < 86400) return t('time.hoursAgo', { n: Math.round(s / 3600) })
  return new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short' })
}
