import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Gamepad2, RotateCcw, Trophy } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { quizApi, type AnswerResult, type PlayerStats, type QuestionType, type QuestionView, type QuizSummary } from '@/lib/backend'
import { useDocumentMeta } from '@/hooks/useMisc'
import { Card, ErrorText, PageShell, RequireUser } from '@/components/layout/PageShell'
import { QuestionPanel, type Feedback } from '@/components/game/QuestionPanel'
import { QuizGlobe } from '@/components/game/QuizGlobe'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'] as const
export const TYPES: { id: QuestionType; label: string }[] = [
  { id: 'LOCATE', label: 'Find on globe' },
  { id: 'CAPITAL', label: 'Capitals' },
  { id: 'FLAG', label: 'Flags' },
  { id: 'POPULATION', label: 'Population' },
]

type Phase =
  | { kind: 'setup' }
  | { kind: 'playing'; id: string; view: QuestionView; endsAt: number; picked: string | null; result: AnswerResult | null }
  | { kind: 'summary'; summary: QuizSummary }

export default function QuizPage() {
  useDocumentMeta({ title: 'Geo quiz · World Explorer', description: 'Capitals, flags, population and finding countries on the globe.' })
  return (
    <RequireUser>
      <Quiz />
    </RequireUser>
  )
}

function Quiz() {
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' })
  const [error, setError] = useState<unknown>(null)

  const loadQuestion = useCallback(async (id: string) => {
    const view = await quizApi.question(id)
    setPhase({ kind: 'playing', id, view, endsAt: Date.now() + view.question.timeLimitSeconds * 1000, picked: null, result: null })
  }, [])

  const start = async (mode: 'CLASSIC' | 'DAILY', region: string | null, types: QuestionType[]) => {
    setError(null)
    try {
      const s = await quizApi.start({ mode, region, types: mode === 'CLASSIC' ? types : undefined })
      await loadQuestion(s.id)
    } catch (e) {
      setError(e)
    }
  }

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

  // after feedback, continue automatically
  const timer = useRef<number>(undefined)
  useEffect(() => {
    if (phase.kind === 'playing' && phase.result) {
      timer.current = window.setTimeout(next, phase.result.correct ? 1600 : 2800)
      return () => window.clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind === 'playing' ? phase.result : null])

  if (phase.kind === 'setup') {
    return (
      <PageShell title="Geo quiz" eyebrow="Single player">
        <Setup onStart={start} />
        <ErrorText error={error} />
      </PageShell>
    )
  }

  if (phase.kind === 'summary') {
    return (
      <PageShell title="Your result" eyebrow="Quiz finished">
        <Summary summary={phase.summary} onAgain={() => setPhase({ kind: 'setup' })} />
      </PageShell>
    )
  }

  const q = phase.view.question
  const feedback: Feedback | null = phase.result
  const isLocate = q.type === 'LOCATE'
  return (
    <PageShell
      title={`${(phase.result?.score ?? phase.view.score).toLocaleString('en')} points`}
      eyebrow="Score"
      wide={isLocate}
      actions={
        phase.result && (
          <Button variant="outline" onClick={next}>
            {phase.result.finished ? 'See result' : 'Next question'}
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
            className="h-[60vh] min-h-[420px] rounded-3xl border border-border"
            onPick={answer}
            disabled={!!phase.picked}
            highlight={phase.result ? phase.result.correctAnswer : phase.picked}
          />
        )}
      </div>
      <ErrorText error={error} />
    </PageShell>
  )
}

function Setup({ onStart }: { onStart: (mode: 'CLASSIC' | 'DAILY', region: string | null, types: QuestionType[]) => void }) {
  const [region, setRegion] = useState<string | null>(null)
  const [types, setTypes] = useState<QuestionType[]>(TYPES.map((t) => t.id))
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const ranked = region === null && types.length === TYPES.length

  useEffect(() => {
    quizApi.stats().then(setStats).catch(() => {})
  }, [])

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <Card>
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Gamepad2 className="size-5 text-primary" /> Classic
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">10 questions. Faster correct answers earn up to 500 bonus points.</p>
        <p className="eyebrow mt-6">Region</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip active={region === null} onClick={() => setRegion(null)}>Whole world</Chip>
          {REGIONS.map((r) => (
            <Chip key={r} active={region === r} onClick={() => setRegion(r)}>{r}</Chip>
          ))}
        </div>
        <p className="eyebrow mt-6">Question types</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <Chip
              key={t.id}
              active={types.includes(t.id)}
              onClick={() =>
                setTypes((cur) => (cur.includes(t.id) ? (cur.length > 1 ? cur.filter((x) => x !== t.id) : cur) : [...cur, t.id]))
              }
            >
              {t.label}
            </Chip>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button onClick={() => onStart('CLASSIC', region, types)}>Start quiz</Button>
          <span className="text-xs text-muted-foreground">
            {ranked ? 'Counts for the leaderboards.' : 'Practice mode: only the default settings are ranked.'}
          </span>
        </div>
      </Card>
      <div className="flex flex-col gap-6">
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <CalendarDays className="size-5 text-primary" /> Daily challenge
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">The same 10 questions for everybody today. One attempt.</p>
          <Button variant="outline" className="mt-5 w-full" onClick={() => onStart('DAILY', null, [])}>
            Play today's challenge
          </Button>
        </Card>
        {stats && stats.games + stats.multiplayerGames > 0 && (
          <Card>
            <p className="eyebrow">Your statistics</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Stat label="Games" value={stats.games} />
              <Stat label="Best" value={stats.bestScore.toLocaleString('en')} />
              <Stat label="Accuracy" value={`${stats.accuracy}%`} />
              <Stat label="Match wins" value={stats.multiplayerWins} />
            </dl>
          </Card>
        )}
      </div>
    </div>
  )
}

function Summary({ summary, onAgain }: { summary: QuizSummary; onAgain: () => void }) {
  return (
    <div className="grid gap-6 md:grid-cols-[320px_1fr]">
      <Card>
        <p className="eyebrow">{summary.mode === 'DAILY' ? 'Daily challenge' : summary.region ?? 'Whole world'}</p>
        <p className="tabular mt-2 font-serif text-6xl">{summary.score.toLocaleString('en')}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {summary.correct} of {summary.total} correct · {Math.round(summary.durationMs / 1000)} s
        </p>
        {summary.ranked && (
          <div className="mt-5 flex flex-col gap-1.5 text-sm">
            {summary.dailyRank && <p>#{summary.dailyRank} in today's challenge</p>}
            {summary.weeklyRank && <p>#{summary.weeklyRank} this week</p>}
            {summary.allTimeRank && <p>#{summary.allTimeRank} all time</p>}
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={onAgain}>
            <RotateCcw /> Play again
          </Button>
          <Button variant="outline" asChild>
            <Link to="/leaderboard">
              <Trophy /> Leaderboard
            </Link>
          </Button>
        </div>
      </Card>
      <Card>
        <p className="eyebrow mb-3">Review</p>
        <ol className="divide-y divide-border">
          {summary.review.map((r) => (
            <li key={r.index} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate">{r.prompt}</p>
                <p className="text-xs text-muted-foreground">
                  Answer: <Link to={`/countries/${r.target}`} className="text-foreground hover:underline">{r.correctLabel}</Link>
                  {r.distanceKm != null && r.distanceKm > 0 && ` · ${Math.round(r.distanceKm)} km off`}
                </p>
              </div>
              <span className={cn('tabular shrink-0 font-medium', r.correct ? 'text-emerald-300' : 'text-muted-foreground')}>
                +{r.points}
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

export function isApiError(e: unknown, code: string) {
  return e instanceof ApiError && e.code === code
}
