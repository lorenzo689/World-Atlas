import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { Topology } from 'topojson-specification'
import { HistoricalDevelopment, type FlagRecord } from '@/components/globe/HistoricalDevelopment'
import { HistoricalPreview } from '@/components/globe/HistoricalPreview'
import { buildEntityIndex } from '@/lib/historyEntity'
import { useLang } from '@/i18n'

const data = (name: string) => JSON.parse(readFileSync(resolve(process.cwd(), 'public/data', name), 'utf8'))
const index = buildEntityIndex(data('historical-topology.json') as Topology)
const flags = data('historical-flags.json') as Record<string, FlagRecord[]>

function setup(code: string, year: number, compareYear: number | null = null) {
  const onYearChange = vi.fn()
  const onCompare = vi.fn()
  render(<HistoricalDevelopment code={code} periods={index.get(code)!} year={year} compareYear={compareYear}
    flags={flags[code.slice(1)] ?? []} onYearChange={onYearChange} onCompare={onCompare} />)
  return { onYearChange, onCompare }
}

beforeEach(() => useLang.setState({ lang: 'en' }))

describe('HistoricalDevelopment', () => {
  it('shows the map date, the current dataset period and the presence in 1 January maps', () => {
    setup('H260', 1990)
    expect(screen.getByTestId('entity-map-date')).toHaveTextContent('Map date: 1 January 1990. Maps show borders on 1 January.')
    expect(screen.getByTestId('entity-current')).toHaveTextContent('dataset period 21 September 1949 – 2 October 1990')
    expect(screen.getByTestId('entity-presence')).toHaveTextContent('1946–2019')
    const labels = screen.getByTestId('entity-labels')
    expect(labels).toHaveTextContent('1946–1948 · Western occupation zones')
    expect(labels).toHaveTextContent('1949–1990 · West Germany')
    expect(labels).toHaveTextContent('1991–2019 · Germany')
    expect(screen.getByText(/Label in CShapes: German Federal Republic/)).toBeInTheDocument()
  })

  it('lists dataset periods with capital and geometry changes and marks the shown one', () => {
    setup('H260', 1990)
    const items = within(screen.getByTestId('entity-periods')).getAllByRole('listitem').filter((li) => li.parentElement === screen.getByTestId('entity-periods'))
    expect(items).toHaveLength(3)
    expect(items[1]).toHaveAttribute('aria-current', 'true')
    expect(items[2]).toHaveTextContent('3 October 1990 – 31 December 2019')
    expect(items[2]).toHaveTextContent('Capital: Berlin')
    expect(items[2]).toHaveTextContent('Capital differs from the previous period')
    expect(items[2]).toHaveTextContent('Dataset geometry differs from the previous period')
    expect(screen.getByText(/A new period is a new record of the dataset, or a processing split/)).toBeInTheDocument()
  })

  it('changes the shared Time Machine year and starts comparisons through callbacks', () => {
    const { onYearChange, onCompare } = setup('H260', 1990)
    fireEvent.click(screen.getByRole('button', { name: 'Later dataset period: map of 1 January 1991' }))
    expect(onYearChange).toHaveBeenLastCalledWith(1991)
    fireEvent.click(screen.getByRole('button', { name: 'Earlier dataset period: map of 1 January 1946' }))
    expect(onYearChange).toHaveBeenLastCalledWith(1946)
    fireEvent.click(screen.getAllByRole('button', { name: 'Compare with 1 January 1991' })[0])
    expect(onCompare).toHaveBeenLastCalledWith(1991)
  })

  it('separates the documented event date from the 1 January snapshots and links the primary source', () => {
    const { onYearChange, onCompare } = setup('H265', 1990)
    const events = screen.getByTestId('entity-events')
    expect(events).toHaveTextContent('German reunification')
    expect(events).toHaveTextContent('Event date: 3 October 1990')
    expect(within(events).getByRole('link', { name: 'Primary source ↗' })).toHaveAttribute('href', expect.stringContaining('bundesregierung.de'))
    fireEvent.click(within(events).getByRole('button', { name: 'Compare 1 January 1989 and 1 January 1991' }))
    expect(onYearChange).toHaveBeenCalledWith(1989)
    expect(onCompare).toHaveBeenCalledWith(1991)
  })

  it('says "not in this snapshot" for an absent identifier without claiming the state did not exist', () => {
    const { onYearChange } = setup('H265', 1991)
    const absent = screen.getByTestId('entity-absent')
    expect(absent).toHaveTextContent('Not in the 1 January 1991 snapshot.')
    expect(absent).toHaveTextContent('This alone does not mean that the state did not exist.')
    expect(screen.queryByTestId('entity-current')).toBeNull()
    fireEvent.click(within(absent).getByRole('button', { name: 'Show 1 January 1990' }))
    expect(onYearChange).toHaveBeenCalledWith(1990)
    expect(screen.getByRole('button', { name: 'Later period' })).toBeDisabled()
  })

  it('compares Soviet Union 1991 and Russia 1992 without asserting continuity', () => {
    setup('H365', 1991, 1992)
    const box = screen.getByTestId('entity-comparison')
    expect(box).toHaveTextContent('Comparison: 1 January 1991 and 1 January 1992')
    expect(within(box).getByRole('row', { name: /Label/ })).toHaveTextContent('Soviet Union')
    expect(within(box).getByRole('row', { name: /Label/ })).toHaveTextContent('Russia')
    expect(screen.getByTestId('entity-shared-id')).toHaveTextContent('this is no evidence of state continuity')
    expect(screen.getByTestId('entity-geometry')).toHaveTextContent('Geometry: differs in the dataset')
    expect(box).not.toHaveTextContent(/gain|loss|annex|continu(ed|ation)/i)
    // Many periods: the list is collapsed by default and shows the dataset gaps of 1940.
    expect(screen.getByText('Dataset periods (25)').closest('details')).not.toHaveAttribute('open')
    expect(within(screen.getByTestId('entity-periods')).getAllByText('Gap in the dataset before this period')).toHaveLength(2)
  })

  it('reports a comparison that cannot be made when one snapshot lacks the identifier', () => {
    setup('H265', 1990, 1991)
    const box = screen.getByTestId('entity-comparison')
    expect(within(box).getByRole('row', { name: /In snapshot/ })).toHaveTextContent('not in this snapshot')
    expect(screen.getByTestId('entity-geometry')).toHaveTextContent('not comparable: missing in one snapshot')
    expect(screen.queryByTestId('entity-shared-id')).toBeNull()
  })

  it('names OHM as geometry source for wartime Germany and lists dated flags', () => {
    setup('H255', 1942)
    expect(screen.getAllByText(/OpenHistoricalMap reconstruction \(annexed territory, not occupation\)/).length).toBeGreaterThan(0)
    expect(screen.getByText(/OpenHistoricalMap \(CC0\) for the corrected 1939–1945 Reich footprint/)).toBeInTheDocument()
    expect(screen.getByTestId('entity-flags')).toHaveTextContent('Flag of Germany (1935–1945) (on this map date)')
  })

  it('uses German texts', () => {
    useLang.setState({ lang: 'de' })
    setup('H265', 1991)
    expect(screen.getByRole('heading', { name: 'Entwicklung im Datensatz' })).toBeInTheDocument()
    expect(screen.getByTestId('entity-absent')).toHaveTextContent('Nicht im Snapshot vom 1. Januar 1991.')
    expect(screen.getByTestId('entity-map-date')).toHaveTextContent('Kartenstichtag: 1. Januar 1991.')
  })
})

describe('HistoricalPreview with an absent identifier', () => {
  it('keeps the panel with the nearest label and hides statistics and flag', () => {
    render(<HistoricalPreview entity={null} absentLabel="East Germany" year={1991} onClose={() => {}}
      development={{ code: 'H265', periods: index.get('H265')!, year: 1991, compareYear: null, flags: [], onYearChange: () => {}, onCompare: () => {} }} />)
    expect(screen.getByRole('heading', { level: 2, name: 'East Germany' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Historical data context')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByTestId('entity-absent')).toBeInTheDocument()
  })
})
