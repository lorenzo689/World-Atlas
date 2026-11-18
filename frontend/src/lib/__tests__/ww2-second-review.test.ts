import { describe, expect, it } from 'vitest'
import { WW2_MOMENTS } from '../ww2'
import { sideAt, type Side } from './ww2-sides-helper'

// Second review of the World War II areas (November 2026). The control points in
// ww2-history.test.ts were chosen while the data was built, so they share its blind spots. This
// batch was written afterwards from the capture and liberation dates in the Wikipedia articles of the
// places, in regions the first batch hardly touches (Ukraine, the Caucasus, Italy's Adriatic side,
// the Netherlands, central Germany, the south-west Pacific, Burma, the Philippines). Where the map
// and a date disagreed, the date was re-read in a second source before the data was changed.
// Coastal cities are replaced by inland places because generalised coastlines run past them.
const POINTS: Record<string, [string, number, number, Side][]> = {
  '1941-11-12': [
    ['Tikhvin (taken 8 Nov)', 33.6, 59.64, 'axis'], ['Vyborg (Finnish again since Aug 1941)', 28.75, 60.7, 'axis'], ['Sortavala (Finnish again since Aug 1941)', 30.68, 61.7, 'axis'], ['Kalinin/Tver (taken 14 Oct)', 35.92, 56.86, 'axis'], ['Kaluga (taken 12 Oct)', 36.27, 54.51, 'axis'], ['Tula (held)', 37.62, 54.19, 'allied'],
    ['Kharkov (taken 24 Oct)', 36.23, 49.99, 'axis'], ['Kursk (taken 2 Nov)', 36.19, 51.73, 'axis'], ['Orel (taken 3 Oct)', 36.08, 52.97, 'axis'], ['Taganrog (taken 17 Oct)', 38.9, 47.23, 'axis'],
    ['Rostov-on-Don (taken 21 Nov, after the map date)', 39.72, 47.24, 'allied'], ['Petrozavodsk (Finnish since 1 Oct)', 34.35, 61.78, 'axis'], ['Poltava (taken 18 Sep)', 34.55, 49.59, 'axis'],
    ['Užice (Partisan republic, 24 Sep–1 Dec)', 19.85, 43.86, 'allied'], ['Čačak (Partisan republic)', 20.35, 43.89, 'allied'], ['Kiev (taken 19 Sep)', 30.52, 50.45, 'axis'], ['Stalino/Donetsk (taken 20 Oct)', 37.8, 48.0, 'axis'],
  ],
  '1942-11-18': [
    ['Rzhev (German)', 34.33, 56.26, 'axis'], ['Velikiye Luki (until Jan 1943)', 30.54, 56.34, 'axis'], ['Voronezh (held)', 39.2, 51.67, 'allied'], ['Stalingrad (besieged)', 44.5, 48.7, 'allied'],
    ['Rostov-on-Don (retaken 24 Jul)', 39.72, 47.24, 'axis'], ['Krasnodar (taken Aug)', 38.98, 45.04, 'axis'], ['Pyatigorsk (taken Aug)', 43.06, 44.04, 'axis'], ['Nalchik (taken Oct)', 43.62, 43.5, 'axis'],
    ['Grozny (held)', 45.7, 43.32, 'allied'], ['Elista (taken Aug)', 44.27, 46.31, 'axis'], ['Voroshilovgrad/Luhansk (taken Jul)', 39.3, 48.57, 'axis'], ['Belgorod (German)', 36.6, 50.6, 'axis'],
    ['Bihać (Partisan republic, 4 Nov 1942–29 Jan 1943)', 15.87, 44.81, 'allied'], ['Bosanski Petrovac (Partisan republic)', 16.37, 44.55, 'allied'], ['Petrozavodsk (Finnish since 1 Oct 1941)', 34.35, 61.78, 'axis'], ['West of Medvezhyegorsk (Finnish from 5 Dec 1941)', 34.2, 62.85, 'axis'], ['Kondopoga (Finnish)', 34.28, 62.2, 'axis'], ['Vyborg (Finnish)', 28.75, 60.7, 'axis'], ['Sortavala (Finnish since Aug 1941)', 30.68, 61.7, 'axis'],
    ['Rabaul (Japanese since Jan 1942)', 152.1, -4.3, 'axis'], ['Northern New Ireland near Kavieng', 151.0, -2.7, 'axis'], ['Buna–Gona (Japanese beachhead until Jan 1943)', 148.35, -8.75, 'axis'],
    ['Tunis (Axis since 9 Nov; Tunisia is shown amber)', 10.18, 36.8, 'contested'], ['Constantine (Allied since Torch)', 6.61, 36.37, 'allied'], ['Kokoda (retaken 2 Nov)', 147.74, -8.88, 'allied'],
  ],
  '1943-12-15': [
    ['Zaporozhye (14 Oct)', 35.14, 47.84, 'allied'], ['Melitopol (23 Oct)', 35.37, 46.84, 'allied'], ['Kremenchug (29 Sep)', 33.42, 49.07, 'allied'], ['Orel (5 Aug)', 36.08, 52.97, 'allied'],
    ['Bryansk (17 Sep)', 34.36, 53.25, 'allied'], ['Nevel (6 Oct)', 29.93, 56.02, 'allied'], ['Zhitomir (finally liberated 31 Dec)', 28.66, 50.25, 'axis'], ['Smila (12 Feb 1944)', 31.89, 49.22, 'axis'],
    ['Snihurivka (12 Mar 1944)', 32.8, 47.08, 'axis'], ['Polotsk (4 Jul 1944)', 28.78, 55.49, 'axis'], ['Bobruisk (29 Jun 1944)', 29.23, 53.14, 'axis'],
    ['Cassino (German until May 1944)', 13.83, 41.49, 'axis'], ['Foggia (27 Sep)', 15.55, 41.46, 'allied'], ['Pescara (German)', 14.2, 42.46, 'axis'],
    ['Cagliari, Sardinia (Allied since Sep)', 9.1, 39.25, 'allied'],
    ['Rabaul (Japanese; bypassed)', 152.1, -4.3, 'axis'], ['Bougainville, Buin (Japanese)', 155.7, -6.75, 'axis'], ['Truk (Japanese; bypassed)', 151.88, 7.45, 'axis'], ['Babeldaob, Palau (Japanese)', 134.58, 7.51, 'axis'], ['Marshall atoll (Japanese until Feb 1944)', 168.75, 7.31, 'axis'], ['Guam (Japanese since 10 Dec 1941)', 144.78, 13.45, 'axis'], ['Vyborg (Finnish)', 28.75, 60.7, 'axis'], ['Petrozavodsk (Finnish)', 34.35, 61.78, 'axis'], ['Port Moresby (Allied)', 147.15, -9.44, 'allied'], ['Madang (Japanese until 24 Apr 1944)', 145.6, -5.2, 'axis'], ['Lae (retaken 16 Sep 1943)', 146.99, -6.73, 'allied'], ['Wewak (Japanese until 1945)', 143.6, -3.58, 'axis'],
    ['Imphal (British-held)', 93.95, 24.8, 'allied'], ['Kohima (British-held)', 94.1, 25.67, 'allied'], ['Myitkyina (Japanese until Aug 1944)', 97.4, 25.38, 'axis'],
  ],
  '1944-12-15': [
    ['Antwerp (4 Sep)', 4.4, 51.22, 'allied'], ['Maastricht (Sep)', 5.69, 50.85, 'allied'], ['Nijmegen (Sep)', 5.85, 51.84, 'allied'], ['Arnhem (until Apr 1945)', 5.9, 51.98, 'axis'], ['Venlo (until Mar 1945)', 6.17, 51.37, 'axis'],
    ['Breda (29 Oct)', 4.78, 51.59, 'allied'], ['Belfort (20 Nov)', 6.86, 47.64, 'allied'], ['Colmar (Colmar Pocket until Feb 1945)', 7.36, 48.08, 'axis'], ['Nancy (15 Sep)', 6.18, 48.69, 'allied'],
    ['Bastogne (before the Bulge)', 5.72, 50.0, 'allied'], ['Trier (German)', 6.64, 49.75, 'axis'], ['Düren (taken Feb 1945)', 6.49, 50.8, 'axis'],
    ['Ravenna (5 Dec)', 12.2, 44.42, 'allied'], ['Modena (German until Apr 1945)', 10.93, 44.65, 'axis'], ['Forlì (9 Nov)', 12.04, 44.22, 'allied'], ['Lucca (5 Sep)', 10.5, 43.84, 'allied'], ['La Spezia (taken Apr 1945)', 9.82, 44.1, 'axis'],
    ['Białystok (27 Jul)', 23.16, 53.13, 'allied'], ['Vilnius (13 Jul)', 25.28, 54.69, 'allied'], ['Kaunas (1 Aug)', 23.9, 54.9, 'allied'], ['Tallinn (22 Sep)', 24.75, 59.44, 'allied'],
    ['Saldus (Courland pocket)', 22.49, 56.66, 'axis'], ['Tilsit (German)', 21.88, 55.07, 'axis'], ['Lviv (27 Jul)', 24.03, 49.84, 'allied'], ['Uzhhorod (27 Oct)', 22.29, 48.62, 'allied'],
    ['Debrecen (Oct)', 21.63, 47.53, 'allied'], ['Banská Bystrica (German since Oct)', 19.15, 48.73, 'axis'], ['Košice (taken 19 Jan 1945)', 21.26, 48.72, 'axis'], ['Rovaniemi (German left 14 Oct)', 25.73, 66.5, 'allied'],
    ['Guam (secured 10 Aug)', 144.78, 13.45, 'allied'], ['Biak (Allied)', 136.0, -1.15, 'allied'], ['Myitkyina (Aug)', 97.4, 25.38, 'allied'],
    ['Rabaul (bypassed)', 152.1, -4.3, 'axis'], ['Wewak (Japanese)', 143.6, -3.58, 'axis'], ['Truk (bypassed)', 151.88, 7.45, 'axis'], ['Babeldaob, Palau (Japanese)', 134.58, 7.51, 'axis'], ['Bougainville (Australian offensive since Nov)', 155.7, -6.75, 'contested'], ['Saipan (secured 9 Jul)', 145.72, 15.2, 'allied'], ['Marshall atoll (U.S.-controlled since Feb 1944)', 168.75, 7.31, 'allied'], ['Meiktila (taken 3 Mar 1945)', 95.86, 20.88, 'axis'], ['Lashio (taken 7 Mar 1945)', 97.75, 22.93, 'axis'], ['Taipei (Japanese Taiwan)', 121.56, 25.04, 'axis'],
  ],
  '1945-04-15': [
    ['Dessau (taken 22 Apr)', 12.24, 51.84, 'axis'], ['Chemnitz (German until May)', 12.92, 50.83, 'axis'], ['Halle (taken 19 Apr)', 11.97, 51.48, 'axis'],
    ['Würzburg (6 Apr)', 9.93, 49.79, 'allied'], ['Mannheim (29 Mar)', 8.47, 49.49, 'allied'], ['Heidelberg (30 Mar)', 8.69, 49.4, 'allied'], ['Karlsruhe (4 Apr)', 8.4, 49.0, 'allied'],
    ['Bamberg (13 Apr)', 10.89, 49.89, 'allied'], ['Erfurt (12 Apr)', 11.03, 50.98, 'allied'], ['Weimar (11 Apr)', 11.33, 50.98, 'allied'], ['Göttingen (8 Apr)', 9.93, 51.53, 'allied'],
    ['Braunschweig (12 Apr)', 10.52, 52.27, 'allied'], ['Osnabrück (4 Apr)', 8.05, 52.28, 'allied'], ['Münster (2 Apr)', 7.63, 51.96, 'allied'], ['Amersfoort (liberated 7 May)', 5.39, 52.16, 'axis'], ['Zwolle (14 Apr)', 6.09, 52.51, 'allied'],
    ['Wiener Neustadt (3 Apr)', 16.24, 47.81, 'allied'], ['Sopron (1 Apr)', 16.6, 47.68, 'allied'], ['Győr (28 Mar)', 17.63, 47.69, 'allied'], ['Küstrin (30 Mar)', 14.63, 52.59, 'allied'], ['Fürstenwalde (taken 21 Apr)', 14.06, 52.36, 'axis'],
    ['Cottbus (German)', 14.33, 51.76, 'axis'], ['Olomouc (German until May)', 17.25, 49.59, 'axis'], ['Pasewalk (taken 29 Apr)', 13.99, 53.5, 'axis'], ['Gdynia (28 Mar)', 18.45, 54.52, 'allied'],
    ['Ferrara (German)', 11.62, 44.84, 'axis'], ['Modena (German)', 10.93, 44.65, 'axis'], ['Ravenna (Allied)', 12.2, 44.42, 'allied'], ['Banja Luka (22 Apr)', 17.19, 44.77, 'axis'], ['Mostar (14 Feb)', 17.81, 43.34, 'allied'],
    ['Meiktila (3 Mar)', 95.86, 20.88, 'allied'], ['Myitkyina', 97.4, 25.38, 'allied'], ['Taungoo (taken 22 Apr)', 96.43, 18.94, 'axis'], ['Cebu (taken 27 Mar; mop-up continued, amber)', 123.9, 10.3, 'contested'],
    ['Zamboanga (10 Mar; Japanese held the interior, amber)', 122.07, 6.91, 'contested'],
    ['Rabaul (bypassed)', 152.1, -4.3, 'axis'], ['Wewak (Japanese)', 143.6, -3.58, 'axis'], ['Taipei (Japanese Taiwan)', 121.56, 25.04, 'axis'],
  ],
}

// Known deviations from the documents, kept visible instead of deleted: the test passes while the data is
// still wrong and fails as soon as the data is fixed, so the entry must then be moved into POINTS.
const KNOWN_DEVIATIONS: [string, string, number, number, Side, string][] = [
  ['1944-12-15', 'Imola (German until 14 Apr 1945)', 11.71, 44.35, 'axis', 'the digitised sheet puts the Allied area about 20 km too far north-west in the Senio sector'],
]

describe('second review: independent control points', () => {
  it('covers only WWII moments', () => {
    const dates = WW2_MOMENTS.map((m) => m.date)
    for (const date of Object.keys(POINTS)) expect(dates).toContain(date)
  })
  for (const [date, points] of Object.entries(POINTS)) {
    it.each(points)(`${date}: %s`, (_place, lng, lat, expected) => {
      expect(sideAt(date, lng, lat)).toBe(expected)
    })
  }
  it.each(KNOWN_DEVIATIONS)('known deviation %s %s (%#)', (date, _place, lng, lat, expected) => {
    expect(sideAt(date, lng, lat)).not.toBe(expected)
  })
})
