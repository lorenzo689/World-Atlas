import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { CountriesProvider } from '@/hooks/useCountries'
import { SearchBox } from '../layout/SearchBox'

const base = {
  numeric: null,
  officialName: 'Official',
  subregion: null,
  independent: true,
  unMember: true,
  landlocked: false,
  area: 1,
  latlng: [0, 0],
  borders: [],
  currencies: [],
  languages: [],
  flagEmoji: '',
  tld: [],
  callingCode: null,
  demonym: null,
  region: 'Europe',
}
const data = [
  { ...base, code: 'DEU', code2: 'DE', name: 'Germany', capital: ['Berlin'] },
  { ...base, code: 'GHA', code2: 'GH', name: 'Ghana', capital: ['Accra'] },
  { ...base, code: 'FRA', code2: 'FR', name: 'France', capital: ['Paris'] },
]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => data })))
})
afterEach(() => vi.unstubAllGlobals())

function setup(onSelect = vi.fn()) {
  render(
    <MemoryRouter>
      <CountriesProvider>
        <SearchBox onSelect={onSelect} />
      </CountriesProvider>
    </MemoryRouter>,
  )
  return onSelect
}

describe('SearchBox', () => {
  it('exposes the ARIA combobox pattern and filters as you type', async () => {
    const user = userEvent.setup()
    setup()
    const input = await screen.findByRole('combobox', { name: /search countries/i })
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, 'g')
    const options = await screen.findAllByRole('option')
    const text = options.map((o) => o.textContent).join(' ')
    expect(text).toContain('Germany')
    expect(text).toContain('Ghana')
    expect(input).toHaveAttribute('aria-expanded', 'true')
  })

  it('selects with the keyboard', async () => {
    const user = userEvent.setup()
    const onSelect = setup()
    const input = await screen.findByRole('combobox')
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, 'g')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ code: 'GHA' }))
  })

  it('finds a country by its capital and reports when nothing matches', async () => {
    const user = userEvent.setup()
    setup()
    const input = await screen.findByRole('combobox')
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, 'paris')
    expect(await screen.findByRole('option', { name: /France/ })).toBeInTheDocument()
    await user.clear(input)
    await user.type(input, 'zzz')
    expect(await screen.findByText(/No country matches/)).toBeInTheDocument()
  })
})
