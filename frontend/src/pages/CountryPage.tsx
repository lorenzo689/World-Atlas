import { useEffect, useMemo } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Globe2 } from 'lucide-react'
import { resolveCountry, useCountries } from '@/hooks/useCountries'
import { useDocumentMeta } from '@/hooks/useMisc'
import { useExplorer } from '@/store/explorer'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/feedback'
import { Brand } from '@/components/layout/Brand'
import { SearchBox } from '@/components/layout/SearchBox'
import { Flag } from '@/components/country/Flag'
import { OverviewTab } from '@/components/country/tabs/OverviewTab'
import { PopulationTab } from '@/components/country/tabs/PopulationTab'
import { EconomyTab } from '@/components/country/tabs/EconomyTab'
import { GeographyTab } from '@/components/country/tabs/GeographyTab'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'population', label: 'Population' },
  { id: 'economy', label: 'Economy' },
  { id: 'geography', label: 'Geography' },
] as const
type TabId = (typeof TABS)[number]['id']

const TAB_DESCRIPTIONS: Record<TabId, string> = {
  overview: 'facts, description and geographic context',
  population: 'demographics, life expectancy and urbanization',
  economy: 'GDP, GDP per capita, inflation and unemployment',
  geography: 'borders, neighbours, location and interactive map',
}

export default function CountryPage() {
  const { code, tab } = useParams()
  const navigate = useNavigate()
  const { countries, byCode, status, reload } = useCountries()
  const select = useExplorer((s) => s.select)

  const country = status === 'ready' ? resolveCountry(countries, code) : undefined
  const activeTab: TabId = TABS.find((t) => t.id === tab)?.id ?? 'overview'

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [country?.code])

  const jsonLd = useMemo(
    () =>
      country
        ? {
            '@context': 'https://schema.org',
            '@type': 'Country',
            name: country.name,
            alternateName: country.officialName,
            url: `${window.location.origin}/countries/${country.code}`,
          }
        : null,
    [country],
  )
  useDocumentMeta({
    title: country ? `${country.name} — ${TABS.find((t) => t.id === activeTab)!.label} · World Explorer` : 'World Explorer',
    description: country
      ? `${country.name}: ${TAB_DESCRIPTIONS[activeTab]}. Capital ${country.capital[0] ?? 'n/a'}, ${country.subregion ?? country.region}. Data from the World Bank.`
      : 'Explore every country on an interactive 3D Earth.',
    path: country ? `/countries/${country.code}${activeTab === 'overview' ? '' : `/${activeTab}`}` : undefined,
    jsonLd,
  })

  if (status === 'error') {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <ErrorState title="Couldn’t load country data" onRetry={reload} />
      </div>
    )
  }
  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-6" aria-busy>
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (!country) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-serif text-5xl">Unknown territory</p>
        <p className="text-muted-foreground">“{code}” isn’t a country code we recognise.</p>
        <Button asChild variant="outline">
          <Link to="/">Back to the globe</Link>
        </Button>
      </div>
    )
  }
  // Canonicalise /countries/de → /countries/DEU
  if (code !== country.code) {
    return <Navigate replace to={`/countries/${country.code}${tab ? `/${tab}` : ''}`} />
  }

  const showOnGlobe = () => {
    select(country.code)
    navigate('/')
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-5 sm:px-6">
          <Link
            to="/"
            aria-label="Back to the globe"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <Brand className="shrink-0" />
          <SearchBox className="ml-auto w-full max-w-sm" onSelect={(c) => navigate(`/countries/${c.code}`)} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <section className="animate-rise flex flex-col gap-8 pb-10 pt-10 sm:pt-16 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">{[country.subregion, country.region].filter(Boolean).join(' · ')}</p>
            <h1 className="mt-3 font-serif text-[clamp(2.75rem,8vw,5.5rem)] leading-[0.98] tracking-tight">{country.name}</h1>
            {country.officialName !== country.name && (
              <p className="mt-3 text-sm text-muted-foreground">{country.officialName}</p>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" onClick={showOnGlobe}>
                <Globe2 /> Show on globe
              </Button>
              {!country.independent && (
                <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">Dependent territory</span>
              )}
            </div>
          </div>
          <Flag code={country.code} name={country.name} className="h-auto w-40 shrink-0 shadow-2xl shadow-black/50 sm:w-52 md:w-60" />
        </section>

        <Tabs value={activeTab}>
          <TabsList aria-label={`${country.name} sections`}>
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} asChild>
                <Link to={`/countries/${country.code}${t.id === 'overview' ? '' : `/${t.id}`}`} replace={false}>
                  {t.label}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="pt-8">
            <TabsContent value="overview" key={`o-${country.code}`}>
              <OverviewTab country={country} countries={countries} byCode={byCode} />
            </TabsContent>
            <TabsContent value="population" key={`p-${country.code}`}>
              <PopulationTab country={country} />
            </TabsContent>
            <TabsContent value="economy" key={`e-${country.code}`}>
              <EconomyTab country={country} />
            </TabsContent>
            <TabsContent value="geography" key={`g-${country.code}`}>
              <GeographyTab country={country} byCode={byCode} />
            </TabsContent>
          </div>
        </Tabs>

        <footer className="mt-16 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
          Statistics: <a className="underline-offset-2 hover:text-foreground hover:underline" href="https://data.worldbank.org" target="_blank" rel="noreferrer">World Bank Open Data</a> (CC BY 4.0).
          Country metadata: mledoze/countries (ODbL). Boundaries: Natural Earth. Flags: flag-icons. Descriptions: Wikipedia (CC BY-SA).
          Missing values are shown as “—” and are never estimated.
        </footer>
      </main>
    </div>
  )
}
