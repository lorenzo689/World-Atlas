import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Country } from '@/types'
import { buildIndex, type SearchEntry } from '@/lib/search'

interface CountriesValue {
  status: 'loading' | 'error' | 'ready'
  countries: Country[]
  byCode: Map<string, Country>
  index: SearchEntry[]
  reload: () => void
}

const CountriesContext = createContext<CountriesValue | null>(null)

export function CountriesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: CountriesValue['status']; countries: Country[] }>({
    status: 'loading',
    countries: [],
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    setState((s) => (s.status === 'ready' ? s : { status: 'loading', countries: [] }))
    fetch(`${import.meta.env.BASE_URL}data/countries.json`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<Country[]>
      })
      .then((countries) => setState({ status: 'ready', countries }))
      .catch((e) => {
        if (e?.name !== 'AbortError') setState({ status: 'error', countries: [] })
      })
    return () => ctrl.abort()
  }, [attempt])

  const value = useMemo<CountriesValue>(
    () => ({
      status: state.status,
      countries: state.countries,
      byCode: new Map(state.countries.map((c) => [c.code, c])),
      index: buildIndex(state.countries),
      reload: () => setAttempt((n) => n + 1),
    }),
    [state],
  )

  return <CountriesContext.Provider value={value}>{children}</CountriesContext.Provider>
}

export function useCountries(): CountriesValue {
  const ctx = useContext(CountriesContext)
  if (!ctx) throw new Error('useCountries must be used within CountriesProvider')
  return ctx
}

/** Resolve an alpha-2 or alpha-3 code (any case) to a country. */
export function resolveCountry(countries: Country[], code: string | undefined): Country | undefined {
  if (!code) return undefined
  const c = code.toUpperCase()
  return countries.find((x) => x.code === c || x.code2 === c)
}
