import { useCallback } from 'react'
import { useCountries } from '@/hooks/useCountries'
import { useT } from '@/i18n'
import type { Option, PublicQuestion, QuestionType } from '@/lib/backend'

/**
 * Renders quiz texts in the UI language. The backend sends English prompts plus the structured parts
 * (question type, subject country, option country codes), so the client can rebuild every text in
 * German without the server knowing the language of each player (important for multiplayer, where one
 * broadcast goes to everybody).
 */
export function useQuizText() {
  const t = useT()
  const { byCode } = useCountries()
  const name = useCallback((code: string | null | undefined, fallback = '') => (code && byCode.get(code)?.name) || fallback || code || '', [byCode])

  const prompt = useCallback(
    (q: PublicQuestion) => {
      switch (q.type) {
        case 'LOCATE':
          return t('quiz.prompt.locate', { country: name(q.subject, q.prompt) })
        case 'CAPITAL':
          return t('quiz.prompt.capital', { country: name(q.subject, q.prompt) })
        case 'FLAG':
          return t('quiz.prompt.flag')
        case 'POPULATION':
          return t('quiz.prompt.population')
      }
    },
    [t, name],
  )

  const option = useCallback((o: Option) => (o.code ? name(o.code, o.label) : o.label), [name])

  /** The correct answer in words: the capital for capital questions, otherwise the country name. */
  const answer = useCallback(
    (type: QuestionType, correctCountry: string | null | undefined, correctLabel: string) =>
      type === 'CAPITAL' ? correctLabel : name(correctCountry, correctLabel),
    [name],
  )

  const typeLabel = useCallback((type: QuestionType) => t(`quiz.type.${type}`), [t])

  return { prompt, option, answer, typeLabel, name }
}
