import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import type { Country } from '@/types'
import { useBoundaries } from '@/hooks/useBoundaries'
import { formatArea, formatCoordinate, pluralize } from '@/lib/format'
import { Flag } from '@/components/country/Flag'
import { CountryMap } from '@/components/country/CountryMap'
import { LocatorGlobe } from '@/components/country/LocatorGlobe'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/feedback'

export function GeographyTab({ country, byCode }: { country: Country; byCode: Map<string, Country> }) {
  const boundaries = useBoundaries()
  const neighbours = country.borders.map((b) => byCode.get(b)).filter((c): c is Country => !!c)
  const [lat, lng] = country.latlng ?? [null, null]

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        {boundaries.status === 'loading' && <Skeleton className="aspect-[900/560] w-full rounded-3xl" />}
        {boundaries.status === 'error' && (
          <ErrorState title="Couldn’t load boundary data" onRetry={boundaries.retry} message={boundaries.error.message} />
        )}
        {boundaries.status === 'success' && <CountryMap country={country} boundaries={boundaries.data} byCode={byCode} />}
        <p className="text-[11px] text-muted-foreground">
          Boundaries: Natural Earth 1:50m via world-atlas (public domain). Borders are shown as depicted by that dataset and carry no
          political endorsement.
        </p>
      </div>

      <div className="space-y-6">
        <section aria-labelledby="loc" className="rounded-3xl border border-border bg-white/[0.02] p-6">
          <h2 id="loc" className="eyebrow">
            Location
          </h2>
          <div className="mt-4 flex justify-center">
            <LocatorGlobe country={country} boundaries={boundaries.status === 'success' ? boundaries.data : null} size={220} />
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Region</dt>
              <dd className="text-right">{[country.subregion, country.region].filter(Boolean).join(', ')}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Coordinates</dt>
              <dd className="tabular text-right">{lat != null && lng != null ? formatCoordinate(lat, lng) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Area</dt>
              <dd className="tabular text-right">{formatArea(country.area)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Coastline</dt>
              <dd className="text-right">{country.landlocked ? 'Landlocked' : 'Has sea access'}</dd>
            </div>
          </dl>
          {lat != null && lng != null && (
            <a
              href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=5/${lat}/${lng}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Open in OpenStreetMap <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </section>

        <section aria-labelledby="borders" className="rounded-3xl border border-border bg-white/[0.02] p-6">
          <h2 id="borders" className="eyebrow">
            Borders · {pluralize(neighbours.length, 'neighbour')}
          </h2>
          {neighbours.length ? (
            <ul className="mt-4 space-y-1">
              {neighbours.map((n) => (
                <li key={n.code}>
                  <Link
                    to={`/countries/${n.code}/geography`}
                    className="flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-white/[0.06]"
                  >
                    <Flag code={n.code} name="" className="h-[18px] w-6" />
                    <span className="flex-1 text-sm">{n.name}</span>
                    <span className="text-[11px] tracking-wider text-muted-foreground">{n.code}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {country.name} has no land borders with other countries in the dataset.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
