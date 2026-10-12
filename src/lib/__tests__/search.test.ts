import { describe, expect, it } from 'vitest'
import type { Country } from '@/types'
import { buildIndex, fold, searchCountries } from '../search'

const make = (name: string, code: string, code2: string, capital: string[] = []): Country => ({
  code,
  code2,
  numeric: null,
  name,
  officialName: `Republic of ${name}`,
  capital,
  region: 'Europe',
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
})

const countries = [
  make('Niger', 'NER', 'NE', ['Niamey']),
  make('Nigeria', 'NGA', 'NG', ['Abuja']),
  make('Germany', 'DEU', 'DE', ['Berlin']),
  make('Côte d’Ivoire', 'CIV', 'CI', ['Yamoussoukro']),
  make('South Africa', 'ZAF', 'ZA', ['Pretoria']),
  make('Guinea-Bissau', 'GNB', 'GW', ['Bissau']),
]
const index = buildIndex(countries)

describe('search', () => {
  it('folds diacritics and case', () => {
    expect(fold('  Côte d’Ivoire ')).toBe('cote d’ivoire')
  })

  it('ranks exact > prefix > word-prefix', () => {
    expect(searchCountries(index, 'niger').map((c) => c.name)).toEqual(['Niger', 'Nigeria'])
    expect(searchCountries(index, 'africa').map((c) => c.name)).toEqual(['South Africa'])
    expect(searchCountries(index, 'bissau').map((c) => c.name)).toEqual(['Guinea-Bissau'])
  })

  it('matches without accents', () => {
    expect(searchCountries(index, 'cote').map((c) => c.code)).toEqual(['CIV'])
  })

  it('matches capitals and ISO codes', () => {
    expect(searchCountries(index, 'berlin')[0].code).toBe('DEU')
    expect(searchCountries(index, 'ZAF')[0].code).toBe('ZAF')
  })

  it('returns nothing for empty or unknown queries', () => {
    expect(searchCountries(index, '')).toEqual([])
    expect(searchCountries(index, 'atlantis')).toEqual([])
  })

  it('respects the limit', () => {
    expect(searchCountries(index, 'a', 2)).toHaveLength(2)
  })
})
