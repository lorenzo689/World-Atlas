export interface Currency {
  code: string
  name: string
  symbol: string
}

export interface Country {
  code: string // ISO 3166-1 alpha-3
  code2: string // ISO 3166-1 alpha-2
  numeric: string | null
  name: string
  officialName: string
  capital: string[]
  region: string
  subregion: string | null
  independent: boolean
  unMember: boolean
  landlocked: boolean
  area: number | null // km²
  latlng: [number, number] | null
  borders: string[] // alpha-3 codes
  currencies: Currency[]
  languages: string[]
  flagEmoji: string
  tld: string[]
  callingCode: string | null
  demonym: string | null
}

export type GlobeMode = 'satellite' | 'political' | 'data'

export interface DataPoint {
  year: number
  value: number
}

export interface IndicatorSeries {
  indicatorId: string
  label: string
  points: DataPoint[] // ascending by year, null values removed
  latest: DataPoint | null
  lastUpdated: string | null
}

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'success'; data: T }
