import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { HistoricalTimeline } from '@/components/globe/HistoricalTimeline'
import { HISTORY_EVENTS } from '@/lib/historyCompare'
import { useLang } from '@/i18n'

type Extra = Partial<Parameters<typeof HistoricalTimeline>[0]>

/** Wires the timeline to real year state, like ExplorerPage does, and records every year change. */
function Harness({ start = 1990, extra = {}, changes }: { start?: number; extra?: Extra; changes: (number | null)[] }) {
  const [year, setYear] = useState<number | null>(start)
  return (
    <>
      <HistoricalTimeline allowToday={false} loading={false} error={false} onRetry={() => {}} {...extra} year={year}
        onChange={(next) => { changes.push(next); setYear(next) }} />
      <button type="button" onClick={() => setYear(1950)}>external</button>
    </>
  )
}

const play = () => screen.getByRole('button', { name: 'Play timeline' })
const pause = () => screen.getByRole('button', { name: 'Pause' })
const shown = () => screen.getByRole('region', { name: 'History timeline' }).querySelector('strong')?.textContent
// Advance in small slices so React re-renders (and reschedules playback) between timer callbacks.
const advance = (ms: number) => {
  for (let left = ms; left > 0; left -= 25) act(() => { vi.advanceTimersByTime(Math.min(25, left)) })
}

beforeEach(() => {
  vi.useFakeTimers()
  useLang.setState({ lang: 'en' })
})
afterEach(() => vi.useRealTimers())

describe('HistoricalTimeline playback', () => {
  it('plays one year per 850 ms at 1× and pauses again', () => {
    const changes: (number | null)[] = []
    render(<Harness changes={changes} />)
    fireEvent.click(play())
    advance(849)
    expect(shown()).toBe('1990')
    advance(1)
    expect(shown()).toBe('1991')
    advance(850)
    expect(shown()).toBe('1992')
    fireEvent.click(pause())
    advance(5000)
    expect(shown()).toBe('1992')
    expect(changes).toEqual([1991, 1992])
  })

  it('uses the selected speed', () => {
    const changes: (number | null)[] = []
    render(<Harness changes={changes} />)
    fireEvent.click(screen.getByRole('button', { name: '2× speed' }))
    expect(screen.getByRole('button', { name: '2× speed' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(play())
    advance(425)
    expect(shown()).toBe('1991')
    fireEvent.click(screen.getByRole('button', { name: '0.5× speed' }))
    advance(1699)
    expect(shown()).toBe('1991')
    advance(1)
    expect(shown()).toBe('1992')
  })

  it('stops automatically at the last available year and restarts from the first', () => {
    const changes: (number | null)[] = []
    render(<Harness start={2017} changes={changes} />)
    fireEvent.click(play())
    advance(850 * 2)
    // Stops as soon as the last snapshot is shown, not one step later.
    expect(shown()).toBe('2019')
    expect(play()).toBeInTheDocument()
    advance(850 * 10)
    expect(changes).toEqual([2018, 2019])
    expect(play()).toBeInTheDocument()
    expect(screen.getByTestId('timeline-status')).toHaveTextContent('End of the available period (2019).')
    fireEvent.click(play())
    expect(shown()).toBe('1886')
  })

  it('pauses on manual year selection: slider, step buttons, typed year and external changes', () => {
    const changes: (number | null)[] = []
    render(<Harness changes={changes} />)
    fireEvent.click(play())
    fireEvent.change(screen.getByRole('slider', { name: 'Historical year' }), { target: { value: '1900' } })
    advance(5000)
    expect(shown()).toBe('1900')

    fireEvent.click(play())
    fireEvent.click(screen.getByRole('button', { name: 'One year later' }))
    advance(5000)
    expect(shown()).toBe('1901')

    fireEvent.click(play())
    const input = screen.getByRole('spinbutton', { name: 'Go to year' })
    fireEvent.change(input, { target: { value: '1930' } })
    fireEvent.submit(input)
    advance(5000)
    expect(shown()).toBe('1930')

    fireEvent.click(play())
    fireEvent.click(screen.getByRole('button', { name: 'external' }))
    advance(5000)
    expect(shown()).toBe('1950')
    expect(play()).toBeInTheDocument()
  })

  it('does not schedule the next year while the current one is still being prepared', () => {
    const changes: (number | null)[] = []
    const { rerender } = render(<Harness changes={changes} extra={{ waiting: true }} />)
    fireEvent.click(play())
    advance(10_000)
    expect(changes).toEqual([])
    expect(screen.getByTestId('timeline-status')).toHaveTextContent('Waiting for the map…')
    rerender(<Harness changes={changes} extra={{ waiting: false }} />)
    advance(850)
    expect(changes).toEqual([1991])
  })

  it('pauses and blocks playback on load errors and unsafe comparison updates', () => {
    const changes: (number | null)[] = []
    const { rerender } = render(<Harness changes={changes} />)
    fireEvent.click(play())
    rerender(<Harness changes={changes} extra={{ error: true }} />)
    advance(5000)
    expect(changes).toEqual([])
    expect(play()).toBeDisabled()

    rerender(<Harness changes={changes} extra={{ error: false }} />)
    fireEvent.click(play())
    rerender(<Harness changes={changes} extra={{ blocked: 'Playback paused: the comparison could not be updated.' }} />)
    advance(5000)
    expect(changes).toEqual([])
    expect(play()).toBeDisabled()
    expect(screen.getByTestId('timeline-status')).toHaveTextContent('comparison could not be updated')
  })
})

describe('HistoricalTimeline year controls', () => {
  it('steps one year and disables stepping beyond the range', () => {
    const changes: (number | null)[] = []
    render(<Harness start={1886} changes={changes} />)
    expect(screen.getByRole('button', { name: 'One year earlier' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'One year later' }))
    expect(shown()).toBe('1887')
    fireEvent.click(screen.getByRole('button', { name: 'One year earlier' }))
    expect(shown()).toBe('1886')
  })

  it('rejects typed years without a snapshot', () => {
    const changes: (number | null)[] = []
    render(<Harness changes={changes} />)
    const input = screen.getByRole('spinbutton', { name: 'Go to year' })
    // Native min/max validation would swallow the submit in browsers and hide the message.
    expect(input.closest('form')).toHaveAttribute('novalidate')
    for (const bad of ['1885', '2020']) {
      fireEvent.change(input, { target: { value: bad } })
      fireEvent.submit(input)
      expect(screen.getByRole('alert')).toHaveTextContent('Enter a year from 1886 to 2019.')
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input).toHaveValue(1990)
    }
    expect(changes).toEqual([])
    fireEvent.change(input, { target: { value: '1945' } })
    fireEvent.blur(input)
    expect(changes).toEqual([1945])
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('HistoricalTimeline events', () => {
  it('shows one marker per existing event and pauses when an event is selected', () => {
    const changes: (number | null)[] = []
    const onEventSelect = vi.fn()
    render(<Harness changes={changes} extra={{ events: HISTORY_EVENTS, onEventSelect, selectedEventId: 'czechoslovakia' }} />)
    expect(screen.getAllByTestId('event-marker')).toHaveLength(HISTORY_EVENTS.length)
    const group = screen.getByRole('group', { name: 'Border events' })
    expect(group.querySelectorAll('button')).toHaveLength(HISTORY_EVENTS.length)
    expect(screen.getByRole('button', { name: /Dissolution of Czechoslovakia/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(play())
    fireEvent.click(screen.getByRole('button', { name: '1990 · German reunification' }))
    expect(onEventSelect).toHaveBeenCalledWith('german-unity')
    advance(5000)
    expect(changes).toEqual([])
  })

  it('uses German labels', () => {
    useLang.setState({ lang: 'de' })
    render(<Harness changes={[]} extra={{ events: HISTORY_EVENTS, onEventSelect: () => {} }} />)
    expect(screen.getByRole('button', { name: 'Zeitleiste abspielen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ein Jahr später' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Wiedergabegeschwindigkeit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1990 · Deutsche Wiedervereinigung' })).toBeInTheDocument()
  })
})
