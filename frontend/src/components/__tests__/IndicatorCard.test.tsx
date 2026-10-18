import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { applyRange, IndicatorCard, StatTile } from '../charts/IndicatorCard'

const points = Array.from({ length: 40 }, (_, i) => ({ year: 1985 + i, value: i }))

describe('applyRange', () => {
  it('keeps the trailing N years relative to the latest observation', () => {
    const r = applyRange(points, 10)
    expect(r).toHaveLength(10)
    expect(r[r.length - 1].year).toBe(2024)
    expect(applyRange(points, 'all')).toHaveLength(40)
  })
})

describe('IndicatorCard states', () => {
  const base = { title: 'Inflation', keys: ['inflation' as const], range: 'all' as const }

  it('shows an honest empty state when the World Bank has no values', () => {
    render(
      <IndicatorCard
        {...base}
        loading={false}
        data={{ inflation: { indicatorId: 'FP.CPI.TOTL.ZG', label: 'x', points: [], latest: null, lastUpdated: null } }}
      />,
    )
    expect(screen.getByText(/no published values/i)).toBeInTheDocument()
  })

  it('shows an error with retry', () => {
    render(<IndicatorCard {...base} loading={false} data={null} error={new Error('boom')} onRetry={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('attributes the source', () => {
    render(<IndicatorCard {...base} loading data={null} />)
    expect(screen.getByRole('link', { name: /World Bank Open Data/i })).toHaveAttribute(
      'href',
      'https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG',
    )
  })
})

describe('StatTile', () => {
  it('shows value, unit and the data year', () => {
    render(<StatTile label="GDP" value="$4.5T" year={2024} unit="current US$" />)
    expect(screen.getByText('$4.5T')).toBeInTheDocument()
    expect(screen.getByText('current US$ · 2024')).toBeInTheDocument()
  })

  it('flags missing data', () => {
    render(<StatTile label="GDP" value="—" />)
    expect(screen.getByText('No data')).toBeInTheDocument()
  })
})
