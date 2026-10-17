import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, Flame, Gamepad2, RotateCcw, Swords, Trophy } from 'lucide-react'
import {
  challengeApi,
  quizApi,
  type AnswerResult,
  type PlayerStats,
  type QuestionType,
  type QuestionView,
  type QuizSummary,
} from '@/lib/backend'
import { useDocumentMeta } from '@/hooks/useMisc'
import { useNumberFormat, useT } from '@/i18n'
import { useQuizText } from '@/lib/quizText'
import { Card, ErrorText, PageShell, RequireUser } from '@/components/layout/PageShell'
import { QuestionPanel, type Feedback } from '@/components/game/QuestionPanel'
import { QuizGlobe } from '@/components/game/QuizGlobe'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'] as const
export const TYPES: QuestionType[] = ['LOCATE', 'CAPITAL', 'FLAG', 'POPULATION']

type Phase =
  | { kind: 'setup' }
  | { kind: 'playing'; id: string; view: QuestionView; endsAt: number; picked: string | null; result: AnswerResult | null }
  | { kind: 'summary'; summary: QuizSummary }

export default function QuizPage() {
  const t = useT()
  useDocumentMeta({ title: `${t('quiz.title')} · World Explorer`, description: t('quiz.metaDescription') })
  return (
    <RequireUser>
      <Quiz />
    </RequireUser>
  )
}

function Quiz() {
  const t = useT()
  const fmt = useNumberFormat()
  const [params, setParams] = useSearchParams()
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' })
  const [error, setError] = useState<unknown>(null)
  const startedFromLink = useRef(false)

  const loadQuestion = useCallback(async (id: string) => {
    const view = await quizApi.question(id)
    setPhase({ kind: 'playing', id, view, endsAt: Date.now() + view.question.timeLimitSeconds * 1000, picked: null, result: null })
  }, [])

  const start = useCallback(
    async (body: Parameters<typeof quizApi.start>[0]) => {
      setError(null)
      try {
        const s = await quizApi.start(body)
        await loadQuestion(s.id)
      } catch (e) {
        setError(e)
      }
    },
    [loadQuestion],
  )

  // /quiz?challenge=<slug> starts the duel directly (from the challenge page)
  useEffect(() => {
    const slug = params.get('challenge')
    if (slug && !startedFromLink.current) {
      startedFromLink.current = true
      setParams({}, { replace: true })
      void start({ mode: 'CHALLENGE', challenge: slug })
    }
  }, [params, setParams, start])

  const answer = async (choice: string) => {
    if (phase.kind !== 'playing' || phase.picked) return
    setPhase({ ...phase, picked: choice || '—' })
    try {
      const result = await quizApi.answer(phase.id, phase.view.question.index, choice)
      setPhase((p) => (p.kind === 'playing' ? { ...p, result } : p))
    } catch (e) {
      setError(e)
    }
  }

  const next = async () => {
    if (phase.kind !== 'playing' || !phase.result) return
    if (phase.result.finished) setPhase({ kind: 'summary', summary: await quizApi.summary(phase.id) })
    else await loadQuestion(phase.id)
  }

  // after the feedback, continue automatically (or press Enter / the button)
  const timer = useRef<number>(undefined)
  useEffect(() => {
    if (phase.kind === 'playing' && phase.result) {
      timer.current = window.setTimeout(next, phase.result.correct ? 1600 : 2800)
      const onKey = (e: KeyboardEvent) => e.key === 'Enter' && next()
      window.addEventListener('keydown', onKey)
      return () => {
        window.clearTimeout(timer.current)
        window.removeEventListener('keydown', onKey)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind === 'playing' ? phase.result : null])

  if (phase.kind === 'setup') {
    return (
      <PageShell title={t('quiz.title')} eyebrow={t('quiz.eyebrow')}>
        <Setup onStart={start} />
        <ErrorText error={error} />
      </PageShell>
    )
  }

  if (phase.kind === 'summary') {
    return (
      <PageShell title={t('quiz.resultTitle')} eyebrow={t('quiz.finished')}>
        <Summary summary={phase.summary} onAgain={() => setPhase({ kind: 'setup' })} />
      </PageShell>
    )
  }

  const q = phase.view.question
  const feedback: Feedback | null = phase.result
  const isLocate = q.type === 'LOCATE'
  return (
    <PageShell
      title={t('quiz.points', { points: fmt(phase.result?.score ?? phase.view.score) })}
      eyebrow={t('quiz.score')}
      wide={isLocate}
      actions={
        phase.result && (
          <Button variant="outline" onClick={next}>
            {phase.result.finished ? t('quiz.seeResult') : t('quiz.next')}
          </Button>
        )
      }
    >
      <div className={cn('grid gap-6', isLocate && 'lg:grid-cols-[minmax(0,420px)_1fr]')}>
        <Card>
          <QuestionPanel
            key={`${phase.id}-${q.index}`}
            question={q}
            endsAt={phase.endsAt}
            flagPath={q.hasFlag ? `/quiz/${phase.id}/questions/${q.index}/flag` : undefined}
            picked={phase.picked}
            feedback={feedback}
            onAnswer={answer}
            onTimeout={() => answer('')}
          />
        </Card>
        {isLocate && (
          <QuizGlobe
            className="h-[52vh] min-h-[320px] rounded-3xl border border-border sm:h-[60vh] sm:min-h-[420px]"
            onPick={answer}
            disabled={!!phase.picked}
            highlight={phase.result ? phase.result.correctCountry : phase.picked}
          />
        )}
      </div>
      <ErrorText error={error} />
    </PageShell>
  )
}

function Setup({ onStart }: { onStart: (body: Parameters<typeof quizApi.start>[0]) => void }) {
  const t = useT()
  const fmt = useNumberFormat()
  const text = useQuizText()
  const navigate = useNavigate()
  const [region, setRegion] = useState<string | null>(null)
  const [types, setTypes] = useState<QuestionType[]>(TYPES)
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [error, setError] = useState<unknown>(null)
  const ranked = region === null && types.length === TYPES.length

  useEffect(() => {
    quizApi.stats().then(setStats).catch(() => {})
  }, [])

  const createDuel = async () => {
    try {
      const duel = await challengeApi.create({ region, rounds: 10 })
      navigate(`/challenge/${duel.slug}`)
    } catch (e) {
      setError(e)
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <Card>
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Gamepad2 className="size-5 text-primary" /> {t('quiz.classic')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('quiz.classicHint')}</p>
        <p className="eyebrow mt-6" id="region-label">{t('quiz.region')}</p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="region-label">
          <Chip active={region === null} onClick={() => setRegion(null)}>{t('region.World')}</Chip>
          {REGIONS.map((r) => (
            <Chip key={r} active={region === r} onClick={() => setRegion(r)}>{t(`region.${r}`)}</Chip>
          ))}
        </div>
        <p className="eyebrow mt-6" id="types-label">{t('quiz.types')}</p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="types-label">
          {TYPES.map((id) => (
            <Chip
              key={id}
              active={types.includes(id)}
              onClick={() => setTypes((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : [...cur, id]))}
            >
              {text.typeLabel(id)}
            </Chip>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button onClick={() => onStart({ mode: 'CLASSIC', region, types })}>{t('quiz.start')}</Button>
          <Button variant="outline" onClick={createDuel}>
            <Swords /> {t('quiz.challengeFriend')}
          </Button>
          <span className="text-xs text-muted-foreground">{ranked ? t('quiz.ranked') : t('quiz.practice')}</span>
        </div>
        <ErrorText error={error} />
      </Card>
      <div className="flex flex-col gap-6">
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <CalendarDays className="size-5 text-primary" /> {t('quiz.daily')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('quiz.dailyHint')}</p>
          <Button variant="outline" className="mt-5 w-full" onClick={() => onStart({ mode: 'DAILY' })}>
            {t('quiz.playDaily')}
          </Button>
          <Link to="/achievements" className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Flame className="size-3.5 text-amber-300" /> {t('quiz.streakLink')}
          </Link>
        </Card>
        {stats && stats.games + stats.multiplayerGames > 0 && (
          <Card>
            <p className="eyebrow">{t('quiz.yourStats')}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Stat label={t('quiz.games')} value={stats.games} />
              <Stat label={t('quiz.best')} value={fmt(stats.bestScore)} />
              <Stat label={t('quiz.accuracy')} value={`${stats.accuracy}%`} />
              <Stat label={t('quiz.matchWins')} value={stats.multiplayerWins} />
            </dl>
          </Card>
        )}
      </div>
    </div>
  )
}

function Summary({ summary, onAgain }: { summary: QuizSummary; onAgain: () => void }) {
  const t = useT()
  const fmt = useNumberFormat()
  const text = useQuizText()
  const scope =
    summary.mode === 'DAILY'
      ? t('quiz.daily')
      : summary.mode === 'CHALLENGE'
        ? t('challenge.title')
        : summary.region
          ? t(`region.${summary.region}` as 'region.Europe')
          : t('region.World')
  return (
    <div className="grid gap-6 md:grid-cols-[320px_1fr]">
      <Card>
        <p className="eyebrow">{scope}</p>
        <p className="tabular mt-2 font-serif text-6xl">{fmt(summary.score)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('quiz.correctOf', { correct: summary.correct, total: summary.total })} · {Math.round(summary.durationMs / 1000)} s
        </p>
        {(summary.ranked || summary.challenge) && (
          <div className="mt-5 flex flex-col gap-1.5 text-sm">
            {summary.dailyRank && <p>{t('quiz.rankDaily', { rank: summary.dailyRank })}</p>}
            {summary.weeklyRank && <p>{t('quiz.rankWeekly', { rank: summary.weeklyRank })}</p>}
            {summary.allTimeRank && <p>{t('quiz.rankAllTime', { rank: summary.allTimeRank })}</p>}
            {summary.challenge && (
              <Link to={`/challenge/${summary.challenge}`} className="text-primary hover:underline">
                {t('quiz.seeDuelRanking')}
              </Link>
            )}
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={onAgain}>
            <RotateCcw /> {t('quiz.again')}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/leaderboard">
              <Trophy /> {t('nav.leaderboard')}
            </Link>
          </Button>
        </div>
      </Card>
      <Card>
        <p className="eyebrow mb-3">{t('quiz.review')}</p>
        <ol className="divide-y divide-border">
          {summary.review.map((r) => (
            <li key={r.index} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate">
                  {text.prompt({ index: r.index, total: summary.total, type: r.type, prompt: r.prompt, subject: r.target, options: [], hasFlag: false, timeLimitSeconds: 0 })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('quiz.answer')}:{' '}
                  <Link to={`/countries/${r.correctCountry}`} className="text-foreground hover:underline">
                    {text.answer(r.type, r.correctCountry, r.correctLabel)}
                  </Link>
                  {r.distanceKm != null && r.distanceKm > 0 && ` · ${t('quiz.kmOff', { km: fmt(Math.round(r.distanceKm)) })}`}
                </p>
              </div>
              <span className={cn('tabular shrink-0 font-medium', r.correct ? 'text-emerald-300' : 'text-muted-foreground')}>
                +{fmt(r.points)}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-sm transition',
        active ? 'border-primary bg-primary/15 text-foreground' : 'border-input text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular text-lg">{value}</dd>
    </div>
  )
}
