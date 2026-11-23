import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'
import { EventExplorer, type TourState } from '@/components/globe/EventExplorer'
import { EMPTY_FILTER, HISTORICAL_EVENTS, filterEvents, type EventFilter } from '@/lib/historicalEvents'
import { useLang } from '@/i18n'

type Overrides = Partial<Parameters<typeof EventExplorer>[0]>

function Harness({ year = 1941, selected = null, tour = null, overrides = {} }: { year?: number; selected?: string | null; tour?: TourState | null; overrides?: Overrides }) {
  const [filter, setFilter] = useState<EventFilter>(EMPTY_FILTER)
  const [selectedId, setSelectedId] = useState<string | null>(selected)
  return (
    <MemoryRouter>
      <EventExplorer year={year} events={HISTORICAL_EVENTS} results={filterEvents(HISTORICAL_EVENTS, filter)} filter={filter}
        onFilterChange={setFilter} selectedId={selectedId} onSelect={setSelectedId} tour={tour}
        onTourStart={() => {}} onTourStep={() => {}} onTourPlay={() => {}} onTourEnd={() => {}}
        onShowYear={() => {}} onCompare={() => {}} onOpenLesson={() => {}} onOpenEntity={() => {}}
        entityLabel={(code) => (code === 'H265' ? 'East Germany' : code)} onClose={() => {}} {...overrides} />
    </MemoryRouter>
  )
}

const total = HISTORICAL_EVENTS.length
const listTitles = () => within(screen.getByTestId('event-list')).getAllByRole('button').map((b) => b.querySelector('span')?.textContent)

beforeEach(() => useLang.setState({ lang: 'en' }))

describe('EventExplorer list', () => {
  it('lists all events chronologically with the real result count', () => {
    render(<Harness />)
    expect(screen.getByTestId('event-count')).toHaveTextContent(`${total} of ${total} events`)
    expect(listTitles()[0]).toBe('U.S. Congress votes for war with Spain')
    expect(listTitles().at(-1)).toBe('South Sudan independence')
  })

  it('filters by region, theme, period and search, and shows an empty state with reset', () => {
    render(<Harness />)
    fireEvent.click(within(screen.getByRole('group', { name: 'Region' })).getByRole('button', { name: 'Africa' }))
    expect(screen.getByTestId('event-count')).toHaveTextContent(`18 of ${total} events`)
    expect(listTitles().slice(0, 3)).toEqual(['Second Battle of El Alamein', 'Libya declares independence', 'United States recognizes Sudan'])
    fireEvent.click(within(screen.getByRole('group', { name: 'Theme' })).getByRole('button', { name: 'Statehood' }))
    expect(screen.getByTestId('event-count')).toHaveTextContent(`17 of ${total} events`)
    const from = screen.getByRole('spinbutton', { name: 'From year' })
    fireEvent.change(from, { target: { value: '2000' } })
    fireEvent.blur(from)
    expect(listTitles()).toEqual(['South Sudan independence'])
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search events' }), { target: { value: 'nothing like this' } })
    expect(screen.getByTestId('event-empty')).toHaveTextContent('No event matches these filters.')
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(screen.getByTestId('event-count')).toHaveTextContent(`${total} of ${total} events`)
  })

  it('ignores an invalid period year', () => {
    render(<Harness />)
    const to = screen.getByRole('spinbutton', { name: 'To year' })
    fireEvent.change(to, { target: { value: '2050' } })
    fireEvent.blur(to)
    expect(screen.getByTestId('event-count')).toHaveTextContent(`${total} of ${total} events`)
  })
})

describe('EventExplorer details', () => {
  it('separates the event date from the shown 1 January map and says the map predates it', () => {
    const onShowYear = vi.fn()
    render(<Harness year={1941} overrides={{ onShowYear }} />)
    fireEvent.click(screen.getByRole('button', { name: /Germany invades the Soviet Union/ }))
    const detail = screen.getByTestId('event-detail')
    expect(within(detail).getByTestId('event-date')).toHaveTextContent('Event date: 22 June 1941')
    expect(within(detail).getByTestId('event-map-date')).toHaveTextContent('Map shown: 1 January 1941')
    expect(within(detail).getByTestId('event-relation')).toHaveTextContent('172 days before the event and does not show its outcome')
    expect(within(detail).getByTestId('event-war-view')).toHaveTextContent('World War II view this event belongs to the moment of 12 November 1941; that view shows borders on that exact day')
    expect(within(detail).getByText(/does not by itself prove a border change/)).toBeInTheDocument()
    fireEvent.click(within(detail).getByRole('button', { name: 'Show map of 1 January 1942' }))
    expect(onShowYear).toHaveBeenCalledWith(1942)
    expect(within(detail).getByRole('link', { name: 'Open World War II view' })).toHaveAttribute('href', '/explore?scenario=ww2&year=1941')
  })

  it('states the WWI view uses 1 January maps and the after-map relation', () => {
    render(<Harness year={1915} selected="sarajevo" />)
    expect(screen.getByTestId('event-war-view')).toHaveTextContent('World War I view this event belongs to 1914; that view shows borders on 1 January 1914')
    expect(screen.getByTestId('event-relation')).toHaveTextContent('days after the event')
  })

  it('offers the curated comparison, lesson and country explorer only where they exist', () => {
    const onCompare = vi.fn()
    const onOpenLesson = vi.fn()
    const onOpenEntity = vi.fn()
    render(<Harness year={1990} selected="german-unity" overrides={{ onCompare, onOpenLesson, onOpenEntity }} />)
    const detail = screen.getByTestId('event-detail')
    fireEvent.click(within(detail).getByRole('button', { name: 'Compare 1 January 1989 and 1 January 1991' }))
    expect(onCompare).toHaveBeenCalledWith(1989, 1991)
    fireEvent.click(within(detail).getByRole('button', { name: 'Open guided lesson' }))
    expect(onOpenLesson).toHaveBeenCalledWith('german-unity')
    fireEvent.click(within(detail).getByRole('button', { name: 'Country explorer: East Germany' }))
    expect(onOpenEntity).toHaveBeenCalledWith('H265')
    expect(detail).toHaveTextContent('No documented place: listed without a globe marker.')
  })

  it('offers no comparison or lesson for events without a curated one', () => {
    render(<Harness year={1941} selected="barbarossa" />)
    const detail = screen.getByTestId('event-detail')
    expect(within(detail).queryByRole('button', { name: /^Compare/ })).toBeNull()
    expect(within(detail).queryByRole('button', { name: 'Open guided lesson' })).toBeNull()
    expect(detail).toHaveTextContent('Marker: place anchor from the source catalog')
  })
})

describe('EventExplorer tours', () => {
  it('starts curated tours and a tour of the current results', () => {
    const onTourStart = vi.fn()
    render(<Harness overrides={{ onTourStart }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Europe in the Second World War' }))
    expect(onTourStart).toHaveBeenLastCalledWith('europe-ww2')
    fireEvent.click(screen.getByRole('button', { name: `Tour of these ${total} results` }))
    expect(onTourStart).toHaveBeenLastCalledWith('results')
  })

  it('shows progress and navigates, pauses and ends a running tour', () => {
    const onTourStep = vi.fn()
    const onTourPlay = vi.fn()
    const onTourEnd = vi.fn()
    const tour: TourState = { id: 'europe-ww1', eventIds: ['sarajevo', 'tannenberg', 'gallipoli'], index: 1, playing: true }
    render(<Harness year={1915} selected="tannenberg" tour={tour} overrides={{ onTourStep, onTourPlay, onTourEnd }} />)
    expect(screen.getByTestId('tour-step')).toHaveTextContent('Step 2 of 3')
    expect(screen.getByRole('progressbar', { name: 'Tour progress' })).toHaveAttribute('aria-valuenow', '2')
    fireEvent.click(screen.getByRole('button', { name: /Previous event/ }))
    expect(onTourStep).toHaveBeenLastCalledWith(0)
    fireEvent.click(screen.getByRole('button', { name: /Following event/ }))
    expect(onTourStep).toHaveBeenLastCalledWith(2)
    fireEvent.click(screen.getByRole('button', { name: 'Pause tour' }))
    expect(onTourPlay).toHaveBeenCalledWith(false)
    fireEvent.click(screen.getByRole('button', { name: 'End tour' }))
    expect(onTourEnd).toHaveBeenCalled()
  })

  it('disables stepping beyond both ends and map actions when the map failed', () => {
    const tour: TourState = { id: 'results', eventIds: ['sarajevo', 'tannenberg'], index: 0, playing: false }
    render(<Harness year={1914} selected="sarajevo" tour={tour} overrides={{ mapError: true }} />)
    expect(screen.getByRole('button', { name: /Previous event/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Play tour' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('historical map could not be loaded')
  })
})

describe('EventExplorer in German', () => {
  it('uses German texts and dates', () => {
    useLang.setState({ lang: 'de' })
    render(<Harness year={1941} selected="barbarossa" />)
    expect(screen.getByRole('heading', { name: 'Historische Ereignisse' })).toBeInTheDocument()
    expect(screen.getByTestId('event-date')).toHaveTextContent('Ereignisdatum: 22. Juni 1941')
    expect(screen.getByTestId('event-relation')).toHaveTextContent('172 Tage vor dem Ereignis')
    expect(screen.getByTestId('event-count')).toHaveTextContent(`${total} von ${total} Ereignissen`)
  })
})

describe('EventExplorer history packs', () => {
  it('lists the four regional packs with period, step count and introduction, and starts one', () => {
    const onTourStart = vi.fn()
    render(<Harness overrides={{ onTourStart }} />)
    const packs = within(screen.getByTestId('history-packs')).getAllByRole('button')
    expect(packs).toHaveLength(4)
    expect(packs[0]).toHaveTextContent('Africa Through Independence')
    expect(packs[0]).toHaveTextContent('1951–2011 · 17 steps')
    expect(packs[0]).toHaveTextContent('recognition and independence can fall on different days')
    fireEvent.click(screen.getByRole('button', { name: 'Start history pack: Middle East: A Changing Region' }))
    expect(onTourStart).toHaveBeenCalledWith('middle-east')
  })

  it('shows the introduction and a copy-link control while a pack runs', () => {
    const tour: TourState = { id: 'americas-turning-points', eventIds: ['spanish-american-war-1898', 'panama-1903'], index: 0, playing: false }
    render(<Harness year={1898} selected="spanish-american-war-1898" tour={tour} />)
    expect(screen.getByTestId('tour-intro')).toHaveTextContent('From 1898 to 1981')
    expect(screen.getByRole('button', { name: 'Copy tour link' })).toBeInTheDocument()
  })

  it('offers the Middle East region and German pack names', () => {
    useLang.setState({ lang: 'de' })
    render(<Harness />)
    expect(within(screen.getByRole('group', { name: 'Region' })).getByRole('button', { name: 'Naher Osten' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Geschichtspaket starten: Afrika auf dem Weg zur Unabhängigkeit' })).toBeInTheDocument()
    expect(within(screen.getByTestId('history-packs')).getAllByRole('button')[0]).toHaveTextContent('17 Schritte')
  })
})
