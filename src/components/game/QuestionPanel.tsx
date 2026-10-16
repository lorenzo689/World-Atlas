import { useEffect, useState } from 'react'
import { Check, Clock, MapPin, X } from 'lucide-react'
import type { PublicQuestion } from '@/lib/backend'
import { apiBlobUrl } from '@/lib/api'
import { cn } from '@/lib/utils'

export interface Feedback {
  correct: boolean
  points: number
  correctAnswer: string
  correctLabel: string
  distanceKm: number | null
  late?: boolean
}

const TYPE_LABEL: Record<PublicQuestion['type'], string> = {
  LOCATE: 'Find it on the globe',
  CAPITAL: 'Capital',
  FLAG: 'Flag',
  POPULATION: 'Population',
}

/** Countdown that runs from `endsAt` (epoch ms) and calls `onTimeout` once at zero. */
export function useCountdown(endsAt: number | null, onTimeout?: () => void) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!endsAt) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [endsAt])
  const remaining = endsAt ? Math.max(0, endsAt - now) : 0
  useEffect(() => {
    if (endsAt && remaining === 0) onTimeout?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt, remaining === 0])
  return remaining
}

/**
 * One question: prompt, timer, flag and answer options. LOCATE questions have no options – the
 * surrounding page shows the globe and passes clicks to `onAnswer`.
 */
export function QuestionPanel({
  question,
  endsAt,
  flagPath,
  picked,
  feedback,
  onAnswer,
  onTimeout,
  disabled,
}: {
  question: PublicQuestion
  /** epoch ms */
  endsAt: number
  /** API path of the flag image (fetched with auth, so the answer is never in a URL) */
  flagPath?: string
  picked: string | null
  feedback: Feedback | null
  onAnswer: (id: string) => void
  onTimeout?: () => void
  disabled?: boolean
}) {
  const remaining = useCountdown(feedback ? null : endsAt, onTimeout)
  const total = question.timeLimitSeconds * 1000
  const [flagUrl, setFlagUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!question.hasFlag || !flagPath) return
    let url: string | null = null
    let alive = true
    apiBlobUrl(flagPath).then((u) => {
      url = u
      if (alive) setFlagUrl(u)
    })
    return () => {
      alive = false
      setFlagUrl(null)
      if (url) URL.revokeObjectURL(url)
    }
  }, [question.hasFlag, flagPath])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">
          Question {question.index + 1} / {question.total} · {TYPE_LABEL[question.type]}
        </span>
        {!feedback && (
          <span className="tabular flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="size-4" /> {Math.ceil(remaining / 1000)} s
          </span>
        )}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/5">
        <div
          className={cn('h-full rounded-full transition-[width] duration-100', remaining < 4000 ? 'bg-destructive' : 'bg-primary')}
          style={{ width: feedback ? '0%' : `${Math.min(100, (remaining / total) * 100)}%` }}
        />
      </div>

      <h2 className="font-serif text-3xl leading-tight sm:text-4xl">{question.prompt}</h2>

      {question.hasFlag && (
        <div className="flex justify-center">
          {flagUrl ? (
            <img src={flagUrl} alt="Flag to identify" className="h-36 rounded-lg shadow-2xl ring-1 ring-white/10" />
          ) : (
            <div className="skeleton h-36 w-52" />
          )}
        </div>
      )}

      {question.type === 'LOCATE' ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="size-4 text-primary" />
          {picked ? 'Answer sent' : 'Rotate the globe and click the country. Near misses earn partial points.'}
        </p>
      ) : (
        <div className={cn('grid gap-2.5', question.options.length > 2 ? 'sm:grid-cols-2' : 'grid-cols-2')}>
          {question.options.map((o) => {
            const isPicked = picked === o.id
            const isCorrect = feedback?.correctAnswer === o.id
            return (
              <button
                key={o.id}
                type="button"
                disabled={disabled || !!picked || !!feedback}
                onClick={() => onAnswer(o.id)}
                className={cn(
                  'flex min-h-14 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] transition',
                  'border-input bg-white/[0.03] hover:border-primary/60 hover:bg-white/[0.06] disabled:cursor-default',
                  isPicked && !feedback && 'border-primary bg-primary/10',
                  feedback && isCorrect && 'border-emerald-400/70 bg-emerald-400/10',
                  feedback && isPicked && !isCorrect && 'border-destructive/70 bg-destructive/10',
                )}
              >
                {o.label}
                {feedback && isCorrect && <Check className="size-5 text-emerald-400" />}
                {feedback && isPicked && !isCorrect && <X className="size-5 text-destructive" />}
              </button>
            )
          })}
        </div>
      )}

      {feedback && <FeedbackLine feedback={feedback} />}
    </div>
  )
}

export function FeedbackLine({ feedback }: { feedback: Feedback }) {
  return (
    <div
      className={cn(
        'animate-rise flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm',
        feedback.correct ? 'bg-emerald-400/10 text-emerald-300' : 'bg-destructive/10 text-destructive',
      )}
    >
      <span>
        {feedback.correct ? 'Correct!' : feedback.late ? 'Too late.' : 'Not quite.'} The answer is{' '}
        <strong className="text-foreground">{feedback.correctLabel}</strong>
        {feedback.distanceKm != null && feedback.distanceKm > 0 && (
          <> · your pick was {Math.round(feedback.distanceKm).toLocaleString('en')} km away</>
        )}
      </span>
      <span className="tabular font-medium text-foreground">+{feedback.points.toLocaleString('en')}</span>
    </div>
  )
}
