import { useEffect, useState } from 'react'
import { Check, Clock, MapPin, X } from 'lucide-react'
import type { PublicQuestion } from '@/lib/backend'
import { apiBlobUrl } from '@/lib/api'
import { useQuizText } from '@/lib/quizText'
import { useNumberFormat, useT } from '@/i18n'
import { cn } from '@/lib/utils'

export interface Feedback {
  correct: boolean
  points: number
  correctAnswer: string
  correctLabel: string
  correctCountry: string
  distanceKm: number | null
  late?: boolean
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
 *
 * Keyboard: the options can be chosen with the keys 1–4 (and A–D); the feedback is announced to
 * screen readers through an aria-live region.
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
  const t = useT()
  const text = useQuizText()
  const remaining = useCountdown(feedback ? null : endsAt, onTimeout)
  const total = question.timeLimitSeconds * 1000
  const [flagUrl, setFlagUrl] = useState<string | null>(null)
  const locked = disabled || !!picked || !!feedback

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

  // number / letter keys pick an option
  useEffect(() => {
    if (locked || question.options.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return
      const k = e.key.toUpperCase()
      const index = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'ABCD'.indexOf(k)
      const option = index >= 0 ? question.options[index] : undefined
      if (option) {
        e.preventDefault()
        onAnswer(option.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [locked, question.options, onAnswer])

  const seconds = Math.ceil(remaining / 1000)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">
          {t('quiz.questionOf', { n: question.index + 1, total: question.total })} · {text.typeLabel(question.type)}
        </span>
        {!feedback && (
          <span className="tabular flex items-center gap-1.5 text-sm text-muted-foreground" aria-hidden>
            <Clock className="size-4" /> {seconds} s
          </span>
        )}
      </div>
      <div
        className="h-1 overflow-hidden rounded-full bg-white/5"
        role="progressbar"
        aria-label={t('quiz.timeLeft')}
        aria-valuemin={0}
        aria-valuemax={question.timeLimitSeconds}
        aria-valuenow={feedback ? 0 : seconds}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-100', remaining < 4000 ? 'bg-destructive' : 'bg-primary')}
          style={{ width: feedback ? '0%' : `${Math.min(100, (remaining / total) * 100)}%` }}
        />
      </div>

      <h2 className="font-serif text-3xl leading-tight sm:text-4xl">{text.prompt(question)}</h2>

      {question.hasFlag && (
        <div className="flex justify-center">
          {flagUrl ? (
            <img src={flagUrl} alt={t('quiz.flagAlt')} className="h-28 rounded-lg shadow-2xl ring-1 ring-white/10 sm:h-36" />
          ) : (
            <div className="skeleton h-28 w-40 sm:h-36 sm:w-52" />
          )}
        </div>
      )}

      {question.type === 'LOCATE' ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0 text-primary" />
          {picked ? t('quiz.answerSent') : t('quiz.locateHint')}
        </p>
      ) : (
        <div
          role="group"
          aria-label={t('quiz.options')}
          className={cn('grid gap-2.5', question.options.length > 2 ? 'sm:grid-cols-2' : 'grid-cols-2')}
        >
          {question.options.map((o, i) => {
            const isPicked = picked === o.id
            const isCorrect = feedback?.correctAnswer === o.id
            return (
              <button
                key={o.id}
                type="button"
                disabled={locked}
                onClick={() => onAnswer(o.id)}
                aria-keyshortcuts={String(i + 1)}
                className={cn(
                  'flex min-h-14 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] transition',
                  'border-input bg-white/[0.03] hover:border-primary/60 hover:bg-white/[0.06] disabled:cursor-default',
                  isPicked && !feedback && 'border-primary bg-primary/10',
                  feedback && isCorrect && 'border-emerald-400/70 bg-emerald-400/10',
                  feedback && isPicked && !isCorrect && 'border-destructive/70 bg-destructive/10',
                )}
              >
                <span className="flex items-center gap-3">
                  <kbd className="hidden size-6 shrink-0 place-items-center rounded-md border border-border text-[11px] text-muted-foreground sm:grid">
                    {i + 1}
                  </kbd>
                  {text.option(o)}
                </span>
                {feedback && isCorrect && <Check className="size-5 text-emerald-400" aria-label={t('quiz.correctOption')} />}
                {feedback && isPicked && !isCorrect && <X className="size-5 text-destructive" aria-label={t('quiz.yourWrongOption')} />}
              </button>
            )
          })}
        </div>
      )}

      <div aria-live="polite">{feedback && <FeedbackLine feedback={feedback} type={question.type} />}</div>
    </div>
  )
}

export function FeedbackLine({ feedback, type }: { feedback: Feedback; type: PublicQuestion['type'] }) {
  const t = useT()
  const fmt = useNumberFormat()
  const text = useQuizText()
  const answer = text.answer(type, feedback.correctCountry, feedback.correctLabel)
  return (
    <div
      className={cn(
        'animate-rise flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm',
        feedback.correct ? 'bg-emerald-400/10 text-emerald-300' : 'bg-destructive/10 text-destructive',
      )}
    >
      <span>
        {feedback.correct ? t('quiz.correct') : feedback.late ? t('quiz.tooLate') : t('quiz.wrong')}{' '}
        {t('quiz.answerIs')} <strong className="text-foreground">{answer}</strong>
        {feedback.distanceKm != null && feedback.distanceKm > 0 && (
          <> · {t('quiz.kmAway', { km: fmt(Math.round(feedback.distanceKm)) })}</>
        )}
      </span>
      <span className="tabular font-medium text-foreground">+{fmt(feedback.points)}</span>
    </div>
  )
}
