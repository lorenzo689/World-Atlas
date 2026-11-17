import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeTopologySnapshots, pickTerritory, type TerritoryDataset } from '../territories'
import { WW2_MOMENTS } from '../ww2'

// Historical control points for the World War II scenario: places with a documented status on each
// map date (capture, liberation, entry into the war, change of sides). Every place must get the
// right side: Axis (state territory, annexation or occupation), Allied (state territory or military
// control), the Soviet Union before it joined the Allies, contested, or none (neutral, Vichy France,
// no claim). Coastal cities are replaced by inland places: generalised coastlines run a few km past
// them. When a check fails, either the data or the fact is wrong – look up the date first.
type Side = 'axis' | 'allied' | 'soviet' | 'contested' | 'none'
const data = decodeTopologySnapshots(JSON.parse(readFileSync('public/data/territories-history.json', 'utf8')) as TerritoryDataset)
const SIDE_OF: Record<string, Side> = { axisState: 'axis', axisOccupied: 'axis', alliedState: 'allied', alliedControl: 'allied', sovietPact: 'soviet', contested: 'contested' }

function sideAt(date: string, lng: number, lat: number): Side {
  const snapshot = data.snapshots.find((s) => s.scenario === 'ww2' && s.date === date)!
  const hit = pickTerritory(snapshot.features, new Set(snapshot.features.map((f) => f.id)), lng, lat)
  return hit ? SIDE_OF[hit.actorId] : 'none'
}

const POINTS: Record<string, [string, number, number, Side][]> = {
  '1939-09-16': [
    ['Kraków (taken 6 Sep)', 19.94, 50.06, 'axis'], ['Łódź (taken 9 Sep)', 19.46, 51.76, 'axis'], ['Berlin', 13.4, 52.52, 'axis'], ['Vienna (annexed 1938)', 16.37, 48.21, 'axis'],
    ['Warsaw (besieged until 28 Sep)', 21.01, 52.23, 'allied'], ['Lwów (Polish; Soviet invasion on 17 Sep)', 24.03, 49.84, 'allied'],
    ['Prague (Protectorate)', 14.44, 50.08, 'axis'], ['Bratislava (Slovak state)', 17.11, 48.15, 'axis'], ['Tirana (Italian since April 1939)', 19.82, 41.33, 'axis'],
    ['Rome (Pact of Steel)', 12.5, 41.9, 'axis'], ['Paris (at war since 3 Sep)', 2.35, 48.86, 'allied'], ['London', -0.13, 51.51, 'allied'],
    ['Copenhagen (neutral)', 12.57, 55.68, 'none'], ['Moscow (not Allied in 1939)', 37.62, 55.76, 'none'], ['Washington (neutral)', -77.04, 38.9, 'none'],
  ],
  '1940-06-04': [
    ['Warsaw (General Government)', 21.01, 52.23, 'axis'], ['Lwów (Soviet since Sep 1939)', 24.03, 49.84, 'soviet'], ['Pinsk (Soviet)', 26.1, 52.11, 'soviet'],
    ['Vilnius (no claim before Allied entry)', 25.28, 54.69, 'none'], ['Posen (annexed to the Reich)', 16.93, 52.41, 'axis'],
    ['Zealand west of Copenhagen (9 Apr)', 12.25, 55.6, 'axis'], ['Oslo (9 Apr)', 10.75, 59.91, 'axis'], ['Trondheim (14 Apr)', 10.4, 63.43, 'axis'], ['Narvik area (fighting until 10 Jun)', 17.6, 68.4, 'contested'],
    ['Amsterdam (15 May)', 4.9, 52.37, 'axis'], ['Brussels (17 May)', 4.35, 50.85, 'axis'], ['Luxembourg (10 May)', 6.13, 49.61, 'axis'], ['Lille (31 May)', 3.06, 50.63, 'axis'],
    ['Paris (taken 14 Jun)', 2.35, 48.86, 'allied'], ['Reykjavík area (British occupation, 10 May)', -21.7, 64.1, 'allied'],
  ],
  '1941-11-12': [
    ['Bordeaux (occupied zone)', -0.58, 44.84, 'axis'], ['Nantes', -1.55, 47.22, 'axis'], ['Paris', 2.35, 48.86, 'axis'], ['Lille', 3.06, 50.63, 'axis'],
    ['Vichy (unoccupied zone)', 3.43, 46.13, 'none'], ['Lyon (unoccupied zone)', 4.84, 45.76, 'none'], ['Marseille (unoccupied zone)', 5.37, 43.3, 'none'],
    ['Oslo', 10.75, 59.91, 'axis'], ['Amsterdam', 4.9, 52.37, 'axis'], ['Belgrade', 20.46, 44.79, 'axis'], ['Zagreb (Croatian state)', 15.98, 45.81, 'axis'],
    ['Ljubljana (annexed by Italy)', 14.51, 46.06, 'axis'], ['Skopje (Bulgarian)', 21.43, 42.0, 'axis'], ['Novi Sad (occupied by Hungary since Apr 1941)', 19.84, 45.27, 'axis'],
    ['Cluj (annexed by Hungary, Aug 1940)', 23.59, 46.77, 'axis'], ['Athens', 23.73, 37.98, 'axis'], ['Thessaloniki', 22.94, 40.64, 'axis'], ['Podgorica (Italian Montenegro)', 19.26, 42.44, 'axis'],
    ['Budapest (Tripartite Pact)', 19.04, 47.5, 'axis'], ['Bucharest', 26.1, 44.43, 'axis'], ['Sofia', 23.32, 42.7, 'axis'], ['Tampere (Finland, co-belligerent)', 23.76, 61.5, 'axis'],
    ['Warsaw', 21.01, 52.23, 'axis'], ['Minsk (28 Jun)', 27.57, 53.9, 'axis'], ['Pinsk (pre-war Poland, 1939–41 Soviet)', 26.1, 52.11, 'axis'], ['Brest (22 Jun)', 23.7, 52.1, 'axis'], ['Rivne (Volhynia)', 26.25, 50.62, 'axis'], ['Kiev (19 Sep)', 30.52, 50.45, 'axis'], ['Smolensk (16 Jul)', 32.05, 54.78, 'axis'],
    ['Kalinin (14 Oct)', 35.9, 56.86, 'axis'], ['Mozhaisk (18 Oct)', 36.03, 55.5, 'axis'], ['Kharkov (24 Oct)', 36.23, 49.99, 'axis'], ['Kursk (2 Nov)', 36.19, 51.73, 'axis'],
    ['Moscow', 37.62, 55.76, 'allied'], ['Leningrad (besieged)', 30.32, 59.94, 'allied'], ['Tula (held)', 37.62, 54.19, 'allied'], ['Rostov (taken 21 Nov)', 39.71, 47.24, 'allied'],
    ['Washington (neutral until 8 Dec)', -77.04, 38.9, 'none'], ['Nanjing (Japanese since 1937)', 118.8, 32.06, 'axis'], ['Wuhan (Japanese since 1938)', 114.3, 30.59, 'axis'], ['Chongqing (China not yet Allied)', 106.55, 29.56, 'none'], ['Tokyo area (Tripartite Pact)', 139.65, 35.86, 'axis'], ['Madrid (neutral)', -3.7, 40.42, 'none'],
  ],
  '1942-11-18': [
    ['Lyon (occupied since 11 Nov)', 4.84, 45.76, 'axis'], ['Marseille', 5.37, 43.3, 'axis'], ['Vichy', 3.43, 46.13, 'axis'], ['Corte, Corsica (Italian)', 9.15, 42.31, 'axis'],
    ['Rzhev (salient until Mar 1943)', 34.33, 56.26, 'axis'], ['Pinsk', 26.1, 52.11, 'axis'], ['Vyazma', 34.3, 55.21, 'axis'], ['Demyansk (salient until Mar 1943)', 32.47, 57.64, 'axis'],
    ['Staraya Russa', 31.36, 57.99, 'axis'], ['Orel', 36.06, 52.97, 'axis'], ['Kursk', 36.19, 51.73, 'axis'], ['Rostov (24 Jul)', 39.71, 47.24, 'axis'],
    ['Krasnodar (12 Aug)', 38.98, 45.04, 'axis'], ['Pyatigorsk (9 Aug)', 43.06, 44.04, 'axis'], ['Rome', 12.5, 41.9, 'axis'],
    ['Moscow', 37.62, 55.76, 'allied'], ['Tula', 37.62, 54.19, 'allied'], ['Leningrad', 30.32, 59.94, 'allied'], ['Kalinin (liberated 16 Dec 1941)', 35.9, 56.86, 'allied'],
    ['Tikhvin (liberated 9 Dec 1941)', 33.6, 59.64, 'allied'], ['Tuapse (held)', 39.07, 44.1, 'allied'], ['Astrakhan', 48.03, 46.35, 'allied'],
    ['Washington (at war since 8 Dec 1941)', -77.04, 38.9, 'allied'], ['Algiers area (Allied since Operation Torch)', 3.0, 36.6, 'allied'],
    ['Kuala Lumpur (Japanese-occupied Malaya)', 101.69, 3.14, 'axis'], ['Bandung (Japanese-occupied Java)', 107.61, -6.91, 'axis'], ['Madrid (neutral)', -3.7, 40.42, 'none'], ['Beijing (Japanese since 1937)', 116.4, 39.9, 'axis'], ['Chongqing', 106.55, 29.56, 'allied'], ['Changsha (held until June 1944)', 112.94, 28.23, 'allied'], ['Changchun (Manchukuo)', 125.32, 43.88, 'axis'],
  ],
  '1943-12-15': [
    ['Rome', 12.5, 41.9, 'axis'], ['Florence', 11.26, 43.77, 'axis'], ['Naples (liberated 1 Oct)', 14.27, 40.85, 'allied'], ['Bari', 16.87, 41.12, 'allied'], ['Palermo', 13.36, 38.12, 'allied'],
    ['Kiev (liberated 6 Nov)', 30.52, 50.45, 'allied'], ['Gomel (26 Nov)', 30.98, 52.43, 'allied'], ['Smolensk (25 Sep)', 32.05, 54.78, 'allied'], ['Kharkov (23 Aug)', 36.23, 49.99, 'allied'],
    ['Dnepropetrovsk (25 Oct)', 35.05, 48.46, 'allied'], ['Vitebsk', 30.2, 55.19, 'axis'], ['Mogilev', 30.33, 53.9, 'axis'], ['Minsk', 27.57, 53.9, 'axis'],
    ['Krivoi Rog (until Feb 1944)', 33.39, 47.91, 'axis'], ['Odessa (Romanian Transnistria)', 30.72, 46.48, 'axis'], ['Simferopol (until 13 Apr 1944)', 34.1, 44.95, 'axis'],
    ['Novgorod (until Jan 1944)', 31.27, 58.52, 'axis'], ['Pskov', 28.33, 57.82, 'axis'], ['Paris', 2.35, 48.86, 'axis'], ['Lyon', 4.84, 45.76, 'axis'],
    ['Corte, Corsica (liberated Oct 1943)', 9.15, 42.31, 'allied'], ['Belgrade', 20.46, 44.79, 'axis'], ['Athens', 23.73, 37.98, 'axis'], ['Oslo', 10.75, 59.91, 'axis'],
    ['Budapest', 19.04, 47.5, 'axis'], ['Bucharest', 26.1, 44.43, 'axis'], ['Sofia', 23.32, 42.7, 'axis'],
    ['Nanjing', 118.8, 32.06, 'axis'], ['Wuhan', 114.3, 30.59, 'axis'], ['Changsha (held until June 1944)', 112.94, 28.23, 'allied'], ['Guilin', 110.29, 25.27, 'allied'], ['Chongqing', 106.55, 29.56, 'allied'],
  ],
  '1944-12-15': [
    ['Amsterdam', 4.9, 52.37, 'axis'], ['Rotterdam', 4.48, 51.92, 'axis'], ['Eindhoven (liberated 18 Sep)', 5.48, 51.44, 'allied'], ['Brussels', 4.35, 50.85, 'allied'],
    ['Paris', 2.35, 48.86, 'allied'], ['Aachen (taken 21 Oct)', 6.08, 50.78, 'allied'], ['Strasbourg (23 Nov)', 7.75, 48.57, 'allied'], ['Metz (22 Nov)', 6.18, 49.12, 'allied'],
    ['Saarbrücken (German)', 7.0, 49.23, 'axis'], ['Warsaw (until 17 Jan 1945)', 21.01, 52.23, 'axis'], ['Kraków', 19.94, 50.06, 'axis'], ['Lublin (liberated Jul 1944)', 22.57, 51.25, 'allied'],
    ['Riga (13 Oct)', 24.11, 56.95, 'allied'], ['Kuldīga (Courland pocket)', 21.97, 56.97, 'axis'], ['Belgrade (20 Oct)', 20.46, 44.79, 'allied'], ['Athens', 23.73, 37.98, 'allied'],
    ['Rome', 12.5, 41.9, 'allied'], ['Florence', 11.26, 43.77, 'allied'], ['Bologna', 11.34, 44.49, 'axis'], ['Milan', 9.19, 45.46, 'axis'], ['Zagreb', 15.98, 45.81, 'axis'],
    ['Prague', 14.44, 50.08, 'axis'], ['Oslo', 10.75, 59.91, 'axis'], ['Zealand west of Copenhagen', 12.25, 55.6, 'axis'], ['Pasvik valley near Kirkenes (liberated Oct 1944)', 29.9, 69.5, 'allied'],
    ['Budapest (siege from 26 Dec)', 19.04, 47.5, 'axis'], ['Bucharest (changed sides 23 Aug)', 26.1, 44.43, 'allied'], ['Sofia (changed sides 9 Sep)', 23.32, 42.7, 'allied'],
    ['Tampere (at war with Germany since 15 Sep 1944)', 23.76, 61.5, 'allied'],
    // Audit 2026-11: strongholds and recaptured annexations
    ['Lorient pocket (until 10 May 1945)', -3.3, 47.8, 'axis'], ['Saint-Nazaire pocket, north of the Loire (until 11 May 1945)', -2.2, 47.33, 'axis'],
    ['Dunkirk pocket (until 9 May 1945)', 2.4, 51.0, 'axis'], ['La Rochelle pocket', -1.1, 46.17, 'axis'], ['Royan pocket', -1.0, 45.63, 'axis'],
    ['Jersey (occupied until 9 May 1945)', -2.1, 49.2, 'axis'], ['Chania, Fortress Crete (until 10 May 1945)', 23.95, 35.45, 'axis'],
    ['Heraklion (liberated Oct 1944)', 25.13, 35.3, 'allied'], ['Luxembourg (liberated Sep 1944)', 6.13, 49.61, 'allied'], ['Eupen (liberated Sep 1944)', 6.03, 50.63, 'allied'],
    ['Leyte (U.S. landing 20 Oct 1944)', 124.9, 11.0, 'allied'], ['Manila (Japanese until Mar 1945)', 121.05, 14.62, 'axis'], ['Hollandia (Allied since Apr 1944)', 140.5, -2.58, 'allied'],
    ['Okinawa (Japanese until Apr 1945)', 127.75, 26.3, 'axis'],
    ['Changsha (taken 18 Jun 1944, Ichi-Go)', 112.94, 28.23, 'axis'], ['Guilin (taken 10 Nov 1944)', 110.29, 25.27, 'axis'], ['Liuzhou (taken 11 Nov 1944)', 109.41, 24.33, 'axis'], ['Chongqing', 106.55, 29.56, 'allied'], ['Kunming', 102.72, 25.04, 'allied'],
  ],
  '1945-04-15': [
    ['Amsterdam', 4.9, 52.37, 'axis'], ['Utrecht', 5.12, 52.09, 'axis'], ['Cologne (6 Mar)', 6.96, 50.94, 'allied'], ['Frankfurt (29 Mar)', 8.68, 50.11, 'allied'],
    ['Kassel (4 Apr)', 9.48, 51.31, 'allied'], ['Hannover (10 Apr)', 9.73, 52.37, 'allied'], ['Bremen (taken 26 Apr)', 8.8, 53.08, 'axis'], ['Leipzig (taken 19 Apr)', 12.37, 51.34, 'axis'],
    ['Nuremberg (taken 20 Apr)', 11.08, 49.45, 'axis'], ['Munich', 11.58, 48.14, 'axis'], ['Stuttgart (taken 22 Apr)', 9.18, 48.78, 'axis'], ['Berlin', 13.4, 52.52, 'axis'],
    ['Vienna (13 Apr)', 16.37, 48.21, 'allied'], ['Königsberg (9 Apr)', 20.51, 54.71, 'allied'], ['Danzig (30 Mar)', 18.65, 54.35, 'allied'], ['Posen (23 Feb)', 16.93, 52.41, 'allied'],
    ['Prague', 14.44, 50.08, 'axis'], ['Brno (taken 26 Apr)', 16.61, 49.2, 'axis'], ['Bratislava (4 Apr)', 17.11, 48.15, 'allied'], ['Bologna (21 Apr)', 11.34, 44.49, 'axis'],
    ['Milan', 9.19, 45.46, 'axis'], ['Zagreb', 15.98, 45.81, 'axis'], ['Sarajevo (6 Apr)', 18.41, 43.86, 'allied'], ['Oslo', 10.75, 59.91, 'axis'], ['Kuldīga (Courland pocket)', 21.97, 56.97, 'axis'],
    ['Budapest (taken 13 Feb)', 19.04, 47.5, 'allied'], ['Ankara (declared war 23 Feb)', 32.86, 39.93, 'allied'], ['Buenos Aires area (declared war 27 Mar)', -58.6, -34.65, 'allied'],
    ['Madrid (neutral)', -3.7, 40.42, 'none'], ['Uppsala (Sweden, neutral)', 17.64, 59.86, 'none'],
    ['Changsha', 112.94, 28.23, 'axis'], ['Chongqing', 106.55, 29.56, 'allied'], ['Kunming', 102.72, 25.04, 'allied'], ['Xi’an (never taken)', 108.94, 34.34, 'allied'], ['Changchun (Manchukuo)', 125.32, 43.88, 'axis'],
    // Audit 2026-11: pockets, strongholds, recaptured annexations, Pacific
    ['Fortress Breslau (until 6 May 1945)', 17.04, 51.11, 'axis'], ['Vistula delta (until May 1945)', 19.05, 54.27, 'axis'], ['Samland near Pillau (until 25 Apr)', 20.0, 54.73, 'axis'],
    ['Lorient pocket', -3.3, 47.8, 'axis'], ['Saint-Nazaire pocket, north of the Loire', -2.2, 47.33, 'axis'], ['Dunkirk pocket', 2.4, 51.0, 'axis'], ['La Rochelle pocket', -1.1, 46.17, 'axis'],
    ['Royan pocket (taken 17/20 Apr)', -1.0, 45.63, 'axis'], ['Jersey', -2.1, 49.2, 'axis'], ['Chania, Fortress Crete', 23.95, 35.45, 'axis'],
    ['Strasbourg (French again)', 7.75, 48.57, 'allied'], ['Luxembourg', 6.13, 49.61, 'allied'], ['Tampere (Finland, declared war 3 Mar 1945)', 23.76, 61.5, 'allied'],
    ['Tirana (liberated Nov 1944)', 19.82, 41.33, 'allied'], ['Manila (liberated 3 Mar 1945)', 121.05, 14.62, 'allied'], ['Mandalay (taken 20 Mar 1945)', 96.09, 21.96, 'allied'],
    ['Rangoon (Japanese until 3 May 1945)', 96.17, 16.84, 'axis'], ['Bassein, Irrawaddy delta (Japanese until May 1945)', 94.73, 16.78, 'axis'], ['Baguio, northern Luzon (Japanese until 27 Apr 1945)', 120.6, 16.4, 'axis'], ['Naha, Okinawa (fighting since 1 Apr)', 127.68, 26.21, 'contested'],
  ],
}

describe('World War II areas agree with documented control on each map date', () => {
  it('covers every WWII moment', () => {
    expect(Object.keys(POINTS)).toEqual(WW2_MOMENTS.map((m) => m.date))
  })
  it('colours sides consistently: Axis red, Allies blue, state territory dark, occupation light', () => {
    for (const snapshot of data.snapshots.filter((s) => s.scenario === 'ww2')) for (const f of snapshot.features) {
      const expected = { axisState: '#b91c1c', axisOccupied: '#f87171', alliedState: '#1d4ed8', alliedControl: '#60a5fa', sovietPact: '#a1a1aa', contested: '#f59e0b' }[f.actorId]
      expect(f.color, f.id).toBe(expected)
      // The Soviet annexation of eastern Poland (1939) happened before the USSR joined the Allies.
      if (f.kind === 'state' || f.kind === 'annexation' || f.kind === 'client') expect(['axisState', 'alliedState', 'sovietPact'], f.id).toContain(f.actorId)
      if (f.kind === 'occupation') expect(['axisOccupied', 'alliedControl'], f.id).toContain(f.actorId)
    }
  })
  for (const [date, points] of Object.entries(POINTS)) {
    it.each(points)(`${date}: %s`, (_place, lng, lat, expected) => {
      expect(sideAt(date, lng, lat)).toBe(expected)
    })
  }
})
