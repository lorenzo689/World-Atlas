import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { feature } from 'topojson-client'
import { geoContains } from 'd3-geo'
import type { GeometryCollection, Topology } from 'topojson-specification'
import type { Feature, Geometry } from 'geojson'

// Regression test for the shipped country polygons (public/data/boundaries.json, built by
// scripts/build-data.mjs). Each city must fall inside exactly the listed country. These cases were
// wrong before: Somaliland was dropped (a hole in Somalia) and overseas territories were part of
// France, Norway, the Netherlands or a merged "Indian Ocean Ter." polygon.
const topology = JSON.parse(readFileSync('public/data/boundaries.json', 'utf8')) as Topology
const countries = feature(topology, topology.objects.countries as GeometryCollection<{ code: string }>)
const features = countries.features as Feature<Geometry, { code: string }>[]

const countryAt = (lng: number, lat: number) =>
  features.filter((f) => geoContains(f, [lng, lat])).map((f) => f.properties.code)

// Points are inland on purpose: the 1:50m coastline (rounded to 0.01°) runs past coastal cities
// such as Mogadishu or Fort-de-France, so they fall in no polygon at all. That is a resolution
// limit (docs/MAP-AUDIT.md), not an assignment error, and is not what this test is about.
describe('shipped country polygons', () => {
  it.each([
    ['Hargeisa (Somaliland region)', 44.06, 9.56, 'SOM'],
    ['Baidoa, southern Somalia', 43.65, 3.12, 'SOM'],
    ['Cayenne', -52.33, 4.93, 'GUF'],
    ['Saint-Denis, Réunion', 55.45, -20.88, 'REU'],
    ['inland Martinique', -61.02, 14.65, 'MTQ'],
    ['inland Basse-Terre, Guadeloupe', -61.68, 16.17, 'GLP'],
    ['inland Mayotte', 45.15, -12.82, 'MYT'],
    ['Longyearbyen, Svalbard', 15.63, 78.22, 'SJM'],
    ['Kralendijk, Bonaire', -68.27, 12.15, 'BES'],
    ['Paris', 2.35, 48.86, 'FRA'],
    ['Oslo', 10.75, 59.91, 'NOR'],
    ['Amsterdam', 4.9, 52.37, 'NLD'],
  ])('%s lies in %s', (_name, lng, lat, code) => {
    expect(countryAt(lng, lat)).toEqual([code])
  })

  it('no longer lets France border Brazil (French Guiana is its own polygon)', () => {
    const france = features.find((f) => f.properties.code === 'FRA')!
    expect(geoContains(france, [-52.33, 4.93])).toBe(false)
  })
})
