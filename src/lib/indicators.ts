import {
  formatCompact,
  formatCurrency,
  formatCurrencyCompact,
  formatNumber,
  formatPercent,
  formatYears,
} from './format'

export type IndicatorKey =
  | 'population'
  | 'populationGrowth'
  | 'density'
  | 'lifeExpectancy'
  | 'urbanization'
  | 'age0_14'
  | 'age15_64'
  | 'age65plus'
  | 'birthRate'
  | 'deathRate'
  | 'fertility'
  | 'gdp'
  | 'gdpPerCapita'
  | 'gdpGrowth'
  | 'inflation'
  | 'unemployment'

export interface IndicatorMeta {
  key: IndicatorKey
  id: string // World Bank indicator code
  label: string
  short: string
  unit: string
  format: (v: number | null | undefined) => string
  /** Compact axis tick formatter. */
  tick: (v: number) => string
}

export const SOURCE_NAME = 'World Bank Open Data'
export const sourceUrl = (id: string) => `https://data.worldbank.org/indicator/${id}`

const fmt1 = (v: number | null | undefined) => formatNumber(v, 1)
const pctTick = (v: number) => `${v}%`
const plain = (v: number) => `${v}`

export const INDICATORS: Record<IndicatorKey, IndicatorMeta> = {
  population: { key: 'population', id: 'SP.POP.TOTL', label: 'Population, total', short: 'Population', unit: 'people', format: formatCompact, tick: formatCompact },
  populationGrowth: { key: 'populationGrowth', id: 'SP.POP.GROW', label: 'Population growth (annual %)', short: 'Population growth', unit: '% per year', format: formatPercent, tick: pctTick },
  density: { key: 'density', id: 'EN.POP.DNST', label: 'Population density (people per km² of land area)', short: 'Population density', unit: 'people per km²', format: fmt1, tick: formatCompact },
  lifeExpectancy: { key: 'lifeExpectancy', id: 'SP.DYN.LE00.IN', label: 'Life expectancy at birth, total (years)', short: 'Life expectancy', unit: 'years', format: formatYears, tick: plain },
  urbanization: { key: 'urbanization', id: 'SP.URB.TOTL.IN.ZS', label: 'Urban population (% of total population)', short: 'Urban population', unit: '% of population', format: formatPercent, tick: pctTick },
  age0_14: { key: 'age0_14', id: 'SP.POP.0014.TO.ZS', label: 'Population ages 0–14 (% of total population)', short: 'Ages 0–14', unit: '% of population', format: formatPercent, tick: pctTick },
  age15_64: { key: 'age15_64', id: 'SP.POP.1564.TO.ZS', label: 'Population ages 15–64 (% of total population)', short: 'Ages 15–64', unit: '% of population', format: formatPercent, tick: pctTick },
  age65plus: { key: 'age65plus', id: 'SP.POP.65UP.TO.ZS', label: 'Population ages 65 and above (% of total population)', short: 'Ages 65+', unit: '% of population', format: formatPercent, tick: pctTick },
  birthRate: { key: 'birthRate', id: 'SP.DYN.CBRT.IN', label: 'Birth rate, crude (per 1,000 people)', short: 'Birth rate', unit: 'per 1,000 people', format: fmt1, tick: plain },
  deathRate: { key: 'deathRate', id: 'SP.DYN.CDRT.IN', label: 'Death rate, crude (per 1,000 people)', short: 'Death rate', unit: 'per 1,000 people', format: fmt1, tick: plain },
  fertility: { key: 'fertility', id: 'SP.DYN.TFRT.IN', label: 'Fertility rate, total (births per woman)', short: 'Fertility rate', unit: 'births per woman', format: (v) => formatNumber(v, 2), tick: plain },
  gdp: { key: 'gdp', id: 'NY.GDP.MKTP.CD', label: 'GDP (current US$)', short: 'GDP', unit: 'current US$', format: formatCurrencyCompact, tick: formatCurrencyCompact },
  gdpPerCapita: { key: 'gdpPerCapita', id: 'NY.GDP.PCAP.CD', label: 'GDP per capita (current US$)', short: 'GDP per capita', unit: 'current US$', format: formatCurrency, tick: formatCurrencyCompact },
  gdpGrowth: { key: 'gdpGrowth', id: 'NY.GDP.MKTP.KD.ZG', label: 'GDP growth (annual %)', short: 'GDP growth', unit: '% per year', format: formatPercent, tick: pctTick },
  inflation: { key: 'inflation', id: 'FP.CPI.TOTL.ZG', label: 'Inflation, consumer prices (annual %)', short: 'Inflation', unit: '% per year', format: formatPercent, tick: pctTick },
  unemployment: { key: 'unemployment', id: 'SL.UEM.TOTL.ZS', label: 'Unemployment, total (% of labour force, modeled ILO estimate)', short: 'Unemployment', unit: '% of labour force', format: formatPercent, tick: pctTick },
}

/** Indicators selectable as the choropleth metric in Data mode. */
export const DATA_MODE_METRICS: IndicatorKey[] = [
  'population',
  'density',
  'gdpPerCapita',
  'gdp',
  'lifeExpectancy',
  'urbanization',
  'gdpGrowth',
  'inflation',
  'unemployment',
]
