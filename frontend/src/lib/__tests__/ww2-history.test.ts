import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pickTerritory, type TerritoryDataset } from '../territories'
import { WW2_MOMENTS } from '../ww2'

// Historical control points for the World War II scenario: places with a documented status on each
// map date (capture and liberation dates in the comments). The shipped areas must put every place on
// the right side. Areas cover occupied, annexed and client-state territory; an Axis state's own
// territory (including what Germany annexed) and unoccupied Allied territory carry no area ("none").
// Coastal cities are replaced by inland places: generalised coastlines run a few km past them.
// When a check fails, either the data or the fact is wrong – look up the date before changing it.
type Side = 'axis' | 'western' | 'soviet' | 'contested' | 'none'
const data = JSON.parse(readFileSync('public/data/territories-history.json', 'utf8')) as TerritoryDataset
const AXIS = new Set(['naziGermany', 'italy', 'axisJoint', 'axisEast', 'hungary', 'bulgaria', 'client'])

function sideAt(date: string, lng: number, lat: number): Side {
  const snapshot = data.snapshots.find((s) => s.scenario === 'ww2' && s.date === date)!
  const hit = pickTerritory(snapshot.features, new Set(snapshot.features.map((f) => f.id)), lng, lat)
  if (!hit) return 'none'
  if (hit.kind === 'contested') return 'contested'
  if (AXIS.has(hit.actorId)) return 'axis'
  return hit.actorId === 'sovietUnion' ? 'soviet' : 'western'
}

const POINTS: Record<string, [string, number, number, Side][]> = {
  '1939-09-16': [
    ['Kraków (taken 6 Sep)', 19.94, 50.06, 'axis'], ['Łódź (taken 9 Sep)', 19.46, 51.76, 'axis'],
    ['Warsaw (besieged until 28 Sep)', 21.01, 52.23, 'none'], ['Lwów (Polish; Soviet invasion on 17 Sep)', 24.03, 49.84, 'none'],
    ['Prague (Protectorate)', 14.44, 50.08, 'axis'], ['Bratislava (Slovak state)', 17.11, 48.15, 'axis'], ['Tirana (Italian since April 1939)', 19.82, 41.33, 'axis'],
    ['Paris', 2.35, 48.86, 'none'], ['Copenhagen', 12.57, 55.68, 'none'],
  ],
  '1940-06-04': [
    ['Warsaw (General Government)', 21.01, 52.23, 'axis'], ['Lwów (Soviet since Sep 1939)', 24.03, 49.84, 'soviet'], ['Pinsk (Soviet)', 26.1, 52.11, 'soviet'],
    ['Vilnius (Lithuanian until Aug 1940)', 25.28, 54.69, 'none'], ['Posen (annexed to the Reich: no occupation area)', 16.93, 52.41, 'none'],
    ['Zealand west of Copenhagen (9 Apr)', 12.25, 55.6, 'axis'], ['Oslo (9 Apr)', 10.75, 59.91, 'axis'], ['Trondheim (14 Apr)', 10.4, 63.43, 'axis'], ['Narvik area (fighting until 10 Jun)', 17.6, 68.4, 'contested'],
    ['Amsterdam (15 May)', 4.9, 52.37, 'axis'], ['Brussels (17 May)', 4.35, 50.85, 'axis'], ['Luxembourg (10 May)', 6.13, 49.61, 'axis'], ['Lille (31 May)', 3.06, 50.63, 'axis'],
    ['Paris (taken 14 Jun)', 2.35, 48.86, 'none'],
  ],
  '1941-11-12': [
    ['Bordeaux (occupied zone)', -0.58, 44.84, 'axis'], ['Nantes', -1.55, 47.22, 'axis'], ['Paris', 2.35, 48.86, 'axis'], ['Lille', 3.06, 50.63, 'axis'],
    ['Vichy (unoccupied zone)', 3.43, 46.13, 'none'], ['Lyon (unoccupied zone)', 4.84, 45.76, 'none'], ['Marseille (unoccupied zone)', 5.37, 43.3, 'none'],
    ['Oslo', 10.75, 59.91, 'axis'], ['Amsterdam', 4.9, 52.37, 'axis'], ['Belgrade', 20.46, 44.79, 'axis'], ['Zagreb (Croatian state)', 15.98, 45.81, 'axis'],
    ['Ljubljana (annexed by Italy)', 14.51, 46.06, 'axis'], ['Skopje (Bulgarian)', 21.43, 42.0, 'axis'],
    ['Novi Sad (occupied by Hungary since Apr 1941)', 19.84, 45.27, 'axis'], ['Cluj (annexed by Hungary, Aug 1940)', 23.59, 46.77, 'axis'], ['Athens', 23.73, 37.98, 'axis'],
    ['Thessaloniki', 22.94, 40.64, 'axis'], ['Podgorica (Italian Montenegro)', 19.26, 42.44, 'axis'], ['Warsaw', 21.01, 52.23, 'axis'],
    ['Minsk (28 Jun)', 27.57, 53.9, 'axis'], ['Kiev (19 Sep)', 30.52, 50.45, 'axis'], ['Smolensk (16 Jul)', 32.05, 54.78, 'axis'], ['Kalinin (14 Oct)', 35.9, 56.86, 'axis'],
    ['Mozhaisk (18 Oct)', 36.03, 55.5, 'axis'], ['Kharkov (24 Oct)', 36.23, 49.99, 'axis'], ['Kursk (2 Nov)', 36.19, 51.73, 'axis'],
    ['Moscow', 37.62, 55.76, 'none'], ['Leningrad (besieged)', 30.32, 59.94, 'none'], ['Tula (held)', 37.62, 54.19, 'none'], ['Rostov (taken 21 Nov)', 39.71, 47.24, 'none'],
  ],
  '1942-11-18': [
    ['Lyon (occupied since 11 Nov)', 4.84, 45.76, 'axis'], ['Marseille', 5.37, 43.3, 'axis'], ['Vichy', 3.43, 46.13, 'axis'], ['Ajaccio (Italian)', 8.74, 41.92, 'axis'],
    ['Rzhev (salient until Mar 1943)', 34.33, 56.26, 'axis'], ['Vyazma', 34.3, 55.21, 'axis'], ['Demyansk (salient until Mar 1943)', 32.47, 57.64, 'axis'],
    ['Staraya Russa', 31.36, 57.99, 'axis'], ['Orel', 36.06, 52.97, 'axis'], ['Kursk', 36.19, 51.73, 'axis'], ['Rostov (24 Jul)', 39.71, 47.24, 'axis'],
    ['Krasnodar (12 Aug)', 38.98, 45.04, 'axis'], ['Pyatigorsk (9 Aug)', 43.06, 44.04, 'axis'],
    ['Moscow', 37.62, 55.76, 'none'], ['Tula', 37.62, 54.19, 'none'], ['Leningrad', 30.32, 59.94, 'none'], ['Kalinin (liberated 16 Dec 1941)', 35.9, 56.86, 'none'],
    ['Tikhvin (liberated 9 Dec 1941)', 33.6, 59.64, 'none'], ['Tuapse (held)', 39.07, 44.1, 'none'], ['Astrakhan', 48.03, 46.35, 'none'],
  ],
  '1943-12-15': [
    ['Rome', 12.5, 41.9, 'axis'], ['Florence', 11.26, 43.77, 'axis'], ['Naples (liberated 1 Oct)', 14.27, 40.85, 'western'], ['Bari', 16.87, 41.12, 'western'], ['Palermo', 13.36, 38.12, 'western'],
    ['Kiev (liberated 6 Nov)', 30.52, 50.45, 'none'], ['Gomel (26 Nov)', 30.98, 52.43, 'none'], ['Smolensk (25 Sep)', 32.05, 54.78, 'none'], ['Kharkov (23 Aug)', 36.23, 49.99, 'none'],
    ['Dnepropetrovsk (25 Oct)', 35.05, 48.46, 'none'], ['Vitebsk', 30.2, 55.19, 'axis'], ['Mogilev', 30.33, 53.9, 'axis'], ['Minsk', 27.57, 53.9, 'axis'],
    ['Krivoi Rog (until Feb 1944)', 33.39, 47.91, 'axis'], ['Odessa (Romanian Transnistria)', 30.72, 46.48, 'axis'], ['Simferopol (until 13 Apr 1944)', 34.1, 44.95, 'axis'],
    ['Novgorod (until Jan 1944)', 31.27, 58.52, 'axis'], ['Pskov', 28.33, 57.82, 'axis'], ['Paris', 2.35, 48.86, 'axis'], ['Lyon', 4.84, 45.76, 'axis'],
    ['Ajaccio (liberated Oct 1943)', 8.74, 41.92, 'none'], ['Belgrade', 20.46, 44.79, 'axis'], ['Athens', 23.73, 37.98, 'axis'], ['Oslo', 10.75, 59.91, 'axis'],
  ],
  '1944-12-15': [
    ['Amsterdam', 4.9, 52.37, 'axis'], ['Rotterdam', 4.48, 51.92, 'axis'], ['Eindhoven (liberated 18 Sep)', 5.48, 51.44, 'none'], ['Brussels', 4.35, 50.85, 'none'],
    ['Paris', 2.35, 48.86, 'none'], ['Aachen (taken 21 Oct)', 6.08, 50.78, 'western'], ['Strasbourg (23 Nov)', 7.75, 48.57, 'western'], ['Metz (22 Nov)', 6.18, 49.12, 'western'],
    ['Saarbrücken (German)', 7.0, 49.23, 'none'], ['Warsaw (until 17 Jan 1945)', 21.01, 52.23, 'axis'], ['Kraków', 19.94, 50.06, 'axis'], ['Lublin (liberated Jul 1944)', 22.57, 51.25, 'none'],
    ['Riga (13 Oct)', 24.11, 56.95, 'none'], ['Kuldīga (Courland pocket)', 21.97, 56.97, 'axis'], ['Belgrade (20 Oct)', 20.46, 44.79, 'none'], ['Athens', 23.73, 37.98, 'none'],
    ['Rome', 12.5, 41.9, 'western'], ['Florence', 11.26, 43.77, 'western'], ['Bologna', 11.34, 44.49, 'axis'], ['Milan', 9.19, 45.46, 'axis'], ['Zagreb', 15.98, 45.81, 'axis'],
    ['Prague', 14.44, 50.08, 'axis'], ['Oslo', 10.75, 59.91, 'axis'], ['Zealand west of Copenhagen', 12.25, 55.6, 'axis'], ['Kirkenes (liberated 25 Oct)', 30.05, 69.73, 'none'],
  ],
  '1945-04-15': [
    ['Amsterdam', 4.9, 52.37, 'axis'], ['Utrecht', 5.12, 52.09, 'axis'], ['Cologne (6 Mar)', 6.96, 50.94, 'western'], ['Frankfurt (29 Mar)', 8.68, 50.11, 'western'],
    ['Kassel (4 Apr)', 9.48, 51.31, 'western'], ['Hannover (10 Apr)', 9.73, 52.37, 'western'], ['Bremen (taken 26 Apr)', 8.8, 53.08, 'none'], ['Leipzig (taken 19 Apr)', 12.37, 51.34, 'none'],
    ['Nuremberg (taken 20 Apr)', 11.08, 49.45, 'none'], ['Munich', 11.58, 48.14, 'none'], ['Stuttgart (taken 22 Apr)', 9.18, 48.78, 'none'],
    ['Vienna (13 Apr)', 16.37, 48.21, 'soviet'], ['Königsberg (9 Apr)', 20.51, 54.71, 'soviet'], ['Danzig (30 Mar)', 18.65, 54.35, 'soviet'], ['Posen (23 Feb)', 16.93, 52.41, 'soviet'],
    ['Prague', 14.44, 50.08, 'axis'], ['Brno (taken 26 Apr)', 16.61, 49.2, 'axis'], ['Bratislava (4 Apr)', 17.11, 48.15, 'none'], ['Bologna (21 Apr)', 11.34, 44.49, 'axis'],
    ['Milan', 9.19, 45.46, 'axis'], ['Zagreb', 15.98, 45.81, 'axis'], ['Sarajevo (6 Apr)', 18.41, 43.86, 'none'], ['Oslo', 10.75, 59.91, 'axis'], ['Kuldīga (Courland pocket)', 21.97, 56.97, 'axis'],
  ],
}

describe('World War II areas agree with documented control on each map date', () => {
  it('covers every WWII moment', () => {
    expect(Object.keys(POINTS)).toEqual(WW2_MOMENTS.map((m) => m.date))
  })
  for (const [date, points] of Object.entries(POINTS)) {
    it.each(points)(`${date}: %s`, (_place, lng, lat, expected) => {
      expect(sideAt(date, lng, lat)).toBe(expected)
    })
  }
})
