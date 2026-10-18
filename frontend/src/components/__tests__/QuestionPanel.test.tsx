import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { CountriesProvider } from '@/hooks/useCountries'
import { QuestionPanel, type Feedback } from '@/components/game/QuestionPanel'
import type { PublicQuestion } from '@/lib/backend'
import { useLang } from '@/i18n'

const question: PublicQuestion = {
  index: 0,
  total: 10,
  type: 'CAPITAL',
  prompt: 'What is the capital of Germany?',
  subject: null,
  hasFlag: false,
  timeLimitSeconds: 15,
  // neutral ids: the option id must not reveal the answer
  options: [
    { id: 'A', label: 'Munich', code: null },
    { id: 'B', label: 'Berlin', code: null },
    { id: 'C', label: 'Hamburg', code: null },
    { id: 'D', label: 'Cologne', code: null },
  ],
}

function renderPanel(props: Partial<React.ComponentProps<typeof QuestionPanel>> = {}) {
  const onAnswer = vi.fn()
  render(
    <MemoryRouter>
      <CountriesProvider>
        <QuestionPanel
          question={question}
          endsAt={Date.now() + 15_000}
          picked={null}
          feedback={null}
          onAnswer={onAnswer}
          {...props}
        />
      </CountriesProvider>
    </MemoryRouter>,
  )
  return onAnswer
}

describe('QuestionPanel', () => {
  beforeEach(() => {
    useLang.setState({ lang: 'en' })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('[]', { status: 200 }))))
  })

  it('shows the options and answers on click', async () => {
    const onAnswer = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /Berlin/ }))
    expect(onAnswer).toHaveBeenCalledWith('B')
  })

  it('answers with the keys 1-4 and A-D', async () => {
    const onAnswer = renderPanel()
    await userEvent.keyboard('3')
    expect(onAnswer).toHaveBeenLastCalledWith('C')
    await userEvent.keyboard('d')
    expect(onAnswer).toHaveBeenLastCalledWith('D')
  })

  it('ignores keys once an answer is picked', async () => {
    const onAnswer = renderPanel({ picked: 'A' })
    await userEvent.keyboard('2')
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('announces feedback in an aria-live region', () => {
    const feedback: Feedback = {
      correct: false,
      points: 0,
      correctAnswer: 'B',
      correctLabel: 'Berlin',
      correctCountry: 'DEU',
      distanceKm: null,
    }
    renderPanel({ picked: 'A', feedback })
    expect(screen.getByText(/Berlin/, { selector: '[aria-live] *' })).toBeInTheDocument()
  })

  it('exposes the remaining time as a progressbar', () => {
    renderPanel()
    expect(screen.getByRole('progressbar', { name: /time left/i })).toHaveAttribute('aria-valuemax', '15')
  })
})
