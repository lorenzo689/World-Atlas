// Axis-held strongholds and pockets that the atlas sheets do not show (off the sheet, or too small
// for its scale), plus one contested island. Each is valid from <= date < to and is drawn as a
// SCHEMATIC area: a circle around the fortress town (or a box), clipped to the land of the listed
// Natural Earth countries. The sources give towns and dates, not boundaries; the radius only says
// "the town and its immediate surroundings".
//
// german: true  -> a pocket of German state territory (stays dark red; excluded from Allied-held Reich)
// german: false -> German-occupied territory of another state (light red)
// contested     -> fighting on that date (amber)
// actor         -> occupying power when not Germany (default naziGermany)
const ATLANTIC = { title: 'Wikipedia · Atlantic pockets (garrisons and surrender dates)', url: 'https://en.wikipedia.org/wiki/Atlantic_pockets' }
const CRETE = { title: 'Wikipedia · Fortress Crete', url: 'https://en.wikipedia.org/wiki/Fortress_Crete' }

export const STRONGHOLDS = [
  { id: 'channel-islands', title: { de: 'Besetzte Kanalinseln', en: 'Occupied Channel Islands' }, codes: ['JEY', 'GGY'], circles: [[-2.13, 49.21, 15], [-2.58, 49.46, 12], [-2.2, 49.71, 6]],
    from: '1940-07-01', to: '1945-05-09', source: ATLANTIC,
    note: { de: 'Deutsch besetzt vom 30. Juni/1. Juli 1940 bis 9. Mai 1945 (Alderney bis 16. Mai).', en: 'German-occupied from 30 June/1 July 1940 to 9 May 1945 (Alderney until 16 May).' } },
  { id: 'dunkirk', title: { de: 'Festung Dünkirchen', en: 'Dunkirk pocket' }, codes: ['FRA'], circles: [[2.38, 51.03, 16]], from: '1944-09-15', to: '1945-05-09', source: ATLANTIC,
    note: { de: 'Belagert ab Mitte September 1944, Kapitulation am 9. Mai 1945.', en: 'Besieged from mid-September 1944, surrendered on 9 May 1945.' } },
  { id: 'lorient', title: { de: 'Festung Lorient', en: 'Lorient pocket' }, codes: ['FRA'], circles: [[-3.37, 47.75, 22]], from: '1944-08-12', to: '1945-05-10', source: ATLANTIC,
    note: { de: 'Belagert ab 12. August 1944, Kapitulation am 10. Mai 1945.', en: 'Besieged from 12 August 1944, surrendered on 10 May 1945.' } },
  { id: 'saint-nazaire', title: { de: 'Festung St-Nazaire (beiderseits der Loire)', en: 'Saint-Nazaire pocket (both banks of the Loire)' }, codes: ['FRA'], circles: [[-2.2, 47.27, 28]], from: '1944-08-15', to: '1945-05-11', source: ATLANTIC,
    note: { de: 'Kapitulation am 11. Mai 1945.', en: 'Surrendered on 11 May 1945.' } },
  { id: 'la-rochelle', title: { de: 'Festung La Rochelle', en: 'La Rochelle pocket' }, codes: ['FRA'], circles: [[-1.15, 46.16, 16]], from: '1944-09-01', to: '1945-05-08', source: ATLANTIC,
    note: { de: 'Kapitulation am 7./8. Mai 1945 (Quellen nennen beide Tage).', en: 'Surrendered on 7/8 May 1945 (sources give both days).' } },
  { id: 'royan', title: { de: 'Festung Royan und Pointe de Grave', en: 'Royan pocket and Pointe de Grave' }, codes: ['FRA'], circles: [[-1.03, 45.6, 13]], from: '1944-09-01', to: '1945-04-17', source: ATLANTIC,
    note: { de: 'Am 17./20. April 1945 von französischen Truppen eingenommen.', en: 'Taken by French forces on 17/20 April 1945.' } },
  { id: 'oleron', title: { de: 'Île d’Oléron (deutsch besetzt)', en: 'Île d’Oléron (German-held)' }, codes: ['FRA'], circles: [[-1.3, 45.92, 16]], from: '1944-09-01', to: '1945-04-30', source: ATLANTIC,
    note: { de: 'Kapitulation am 30. April 1945.', en: 'Surrendered on 30 April 1945.' } },
  { id: 'crete-west', title: { de: 'Festung Kreta (Raum Chania)', en: 'Fortress Crete (Chania area)' }, codes: ['GRC'], boxes: [[23.4, 34.9, 24.25, 35.8]], from: '1944-10-12', to: '1945-05-10', source: CRETE,
    note: { de: 'Nach der Räumung von Rethymno und Heraklion im Oktober 1944 hielt die deutsche Garnison den Westen der Insel bis zur Kapitulation am 10. Mai 1945.', en: 'After leaving Rethymno and Heraklion in October 1944, the German garrison held the west of the island until it surrendered on 10 May 1945.' } },
  { id: 'lapland-northwest', title: { de: 'Nordwestspitze Lapplands (deutsch gehalten)', en: 'North-western tip of Lapland (German-held)' }, codes: ['FIN'], circles: [[20.9, 69.0, 45]], from: '1944-11-25', to: '1945-04-27', source: { title: 'Wikipedia · Lapland War', url: 'https://en.wikipedia.org/wiki/Lapland_War' },
    note: { de: 'Die letzten deutschen Truppen verließen Finnland am 27. April 1945.', en: 'The last German troops left Finland on 27 April 1945.' } },
  { id: 'breslau', german: true, title: { de: 'Festung Breslau', en: 'Fortress Breslau' }, codes: ['POL'], circles: [[17.04, 51.11, 10]], from: '1945-02-15', to: '1945-05-06', source: { title: 'Wikipedia · Siege of Breslau', url: 'https://en.wikipedia.org/wiki/Siege_of_Breslau' } },
  { id: 'hel-vistula', german: true, title: { de: 'Halbinsel Hela und Weichseldelta', en: 'Hel peninsula and Vistula delta' }, codes: ['POL'], circles: [[18.75, 54.62, 14], [19.05, 54.28, 15]], from: '1945-03-30', to: '1945-05-09', source: { title: 'Wikipedia · East Pomeranian Offensive', url: 'https://en.wikipedia.org/wiki/East_Pomeranian_offensive' } },
  { id: 'samland', german: true, title: { de: 'Samland mit Pillau', en: 'Samland peninsula with Pillau' }, codes: ['RUS'], circles: [[19.95, 54.72, 22]], from: '1945-04-09', to: '1945-04-25', source: { title: 'Wikipedia · Samland Offensive', url: 'https://en.wikipedia.org/wiki/Samland_offensive' } },
  // Japanese-held areas that the Asia/Pacific sheets lose to coastline offset (Manila Bay) or to
  // the hatched Allied air-operations zone printed over the Irrawaddy delta (April 1945 sheet).
  { id: 'luzon-before-landing', actor: 'japan', title: { de: 'Luzon (japanisch besetzt)', en: 'Luzon (Japanese-occupied)' }, codes: ['PHL'], boxes: [[119.5, 13.55, 124.5, 18.7]], from: '1944-10-20', to: '1945-01-09', source: { title: 'Wikipedia · Battle of Luzon', url: 'https://en.wikipedia.org/wiki/Battle_of_Luzon' },
    note: { de: 'Ganz Luzon blieb bis zur US-Landung im Lingayen-Golf am 9. Januar 1945 japanisch besetzt.', en: 'All of Luzon stayed Japanese-occupied until the U.S. landing in Lingayen Gulf on 9 January 1945.' } },
  { id: 'northern-luzon', actor: 'japan', title: { de: 'Nordluzon (Shobu-Gruppe)', en: 'Northern Luzon (Shobu Group)' }, codes: ['PHL'], boxes: [[120.4, 16.0, 122.6, 18.7]], from: '1945-01-09', to: '1945-08-15', source: { title: 'Wikipedia · Battle of Luzon', url: 'https://en.wikipedia.org/wiki/Battle_of_Luzon' },
    note: { de: 'Yamashitas Truppen hielten die Kordilleren (Baguio bis 27. April 1945) bis zur Kapitulation.', en: 'Yamashita’s forces held the Cordillera (Baguio until 27 April 1945) until the surrender.' } },
  { id: 'lower-burma', actor: 'japan', title: { de: 'Niederburma mit Rangun (japanisch gehalten)', en: 'Lower Burma with Rangoon (Japanese-held)' }, codes: ['MMR'], boxes: [[94.3, 15.7, 97.4, 18.6]], from: '1945-03-01', to: '1945-05-03', source: { title: 'Wikipedia · Operation Dracula', url: 'https://en.wikipedia.org/wiki/Operation_Dracula' },
    note: { de: 'Rangun und das Irrawaddy-Delta blieben bis Anfang Mai 1945 japanisch; Rangun wurde am 3. Mai 1945 kampflos eingenommen.', en: 'Rangoon and the Irrawaddy delta stayed Japanese until early May 1945; Rangoon was entered unopposed on 3 May 1945.' } },
  { id: 'okinawa', contested: true, title: { de: 'Okinawa · Kämpfe seit 1. April 1945', en: 'Okinawa · fighting since 1 April 1945' }, codes: ['JPN'], boxes: [[127.6, 26.05, 128.35, 26.95]], from: '1945-04-01', to: '1945-06-22', source: { title: 'Wikipedia · Battle of Okinawa', url: 'https://en.wikipedia.org/wiki/Battle_of_Okinawa' },
    note: { de: 'US-Truppen hielten Mitte April den Norden und die Mitte; Naha im Süden fiel erst Ende Mai.', en: 'U.S. forces held the north and centre by mid-April; Naha in the south fell only at the end of May.' } },
]

/** Geodesic circle (64 points) around [lon, lat] with radius in km, as a planar ring. */
export function circle(lon, lat, km) {
  const R = 6371, d = km / R, la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180
  const ring = []
  for (let i = 0; i <= 64; i++) {
    const b = (i / 64) * 2 * Math.PI
    const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b))
    const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2))
    ring.push([(lo2 * 180) / Math.PI, (la2 * 180) / Math.PI])
  }
  return ring
}
