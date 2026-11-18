// Axis-held strongholds and pockets that the atlas sheets do not show (off the sheet, or too small
// for its scale), plus one contested island. Each is valid from <= date < to and is drawn as a
// SCHEMATIC area: a circle around the fortress town (or a box), clipped to the land of the listed
// Natural Earth countries. The sources give towns and dates, not boundaries; the radius only says
// "the town and its immediate surroundings".
//
// german: true  -> a pocket of German state territory (stays dark red; excluded from Allied-held Reich)
// german: false -> German-occupied territory of another state (light red)
// contested     -> fighting on that date (amber)
// actor         -> holder when not Germany: 'japan', or 'westernAllies' / 'partisans' (drawn as Allied control)
// carve         -> the area is cut out of the other occupation entries of that date
const ATLANTIC = { title: 'Wikipedia · Atlantic pockets (garrisons and surrender dates)', url: 'https://en.wikipedia.org/wiki/Atlantic_pockets' }
const wiki = (title, page) => ({ title: `Wikipedia · ${title}`, url: `https://en.wikipedia.org/wiki/${page}` })
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
  // ---- Resistance-held territory documented on a map date ---------------------------------------
  { id: 'republic-of-uzice', actor: 'partisans', carve: true, title: { de: 'Republik Užice (Partisanengebiet)', en: 'Republic of Užice (Partisan territory)' }, codes: ['SRB'], circles: [[19.85, 43.86, 45], [20.35, 43.89, 22]], from: '1941-09-24', to: '1941-12-01', source: wiki('Republic of Užice', 'Republic_of_U%C5%BEice'),
    note: { de: 'Befreites Gebiet um Užice und Čačak von Ende September bis Ende November 1941; die Fläche ist ein Kreis um die Städte, die Quelle nennt 15.000–20.000 km².', en: 'Liberated area around Užice and Čačak from late September to late November 1941; drawn as circles around the towns, the source gives 15,000–20,000 km².' } },
  { id: 'bihac-republic', actor: 'partisans', carve: true, title: { de: 'Bihać-Republik (Partisanengebiet)', en: 'Bihać Republic (Partisan territory)' }, codes: ['HRV', 'BIH'], circles: [[15.83, 45.3, 25], [15.9, 44.9, 35], [16.37, 44.5, 28], [16.85, 44.05, 25]], from: '1942-11-04', to: '1943-01-29', source: wiki('Bihać Republic', 'Biha%C4%87_Republic'),
    note: { de: 'Vom 4. November 1942 bis zum 29. Januar 1943 hielten die Partisanen einen rund 250 km langen, 50–70 km breiten Streifen von Vojnić bis Glamoč.', en: 'From 4 November 1942 to 29 January 1943 the Partisans held a strip about 250 km long and 50–70 km wide from Vojnić to Glamoč.' } },
  // ---- Deepest German advance in the north: Tikhvin -----------------------------------------------
  { id: 'tikhvin-salient', title: { de: 'Tichwin (deutsch besetzt)', en: 'Tikhvin (German-held)' }, codes: ['RUS'], circles: [[33.55, 59.64, 25]], from: '1941-11-08', to: '1941-12-09', source: wiki('Tikhvin offensive', 'Tikhvin_offensive'),
    note: { de: 'Am 8. November 1941 von der 39. Armee genommen, am 9. Dezember zurückerobert.', en: 'Taken by the German 39th Army on 8 November 1941, retaken on 9 December.' } },
  // ---- Japanese-held islands the atlas sheets drop (islands under about 450 px) --------------------
  { id: 'rabaul', actor: 'japan', title: { de: 'Rabaul und Gazelle-Halbinsel (japanisch, umgangen)', en: 'Rabaul and the Gazelle Peninsula (Japanese, bypassed)' }, codes: ['PNG'], boxes: [[151.0, -5.6, 152.5, -4.0]], from: '1942-01-23', to: '1945-09-02', source: wiki('Rabaul', 'Rabaul'),
    note: { de: 'Am 23. Januar 1942 erobert; die Alliierten umgingen die Festung (rund 110.000 Mann 1943) und neutralisierten sie aus der Luft.', en: 'Captured on 23 January 1942; the Allies bypassed the fortress (about 110,000 men in 1943) and neutralised it from the air.' } },
  { id: 'new-ireland', actor: 'japan', title: { de: 'Neuirland mit Kavieng (japanisch, umgangen)', en: 'New Ireland with Kavieng (Japanese, bypassed)' }, codes: ['PNG'], boxes: [[150.0, -4.9, 152.7, -2.6]], from: '1942-01-21', to: '1945-09-02', source: wiki('Rabaul', 'Rabaul'),
    note: { de: 'Kavieng wurde im Januar 1942 besetzt und im Zuge der Isolierung Rabauls umgangen.', en: 'Kavieng was occupied in January 1942 and bypassed when Rabaul was isolated.' } },
  { id: 'bougainville-held', actor: 'japan', title: { de: 'Bougainville und Buka (japanisch)', en: 'Bougainville and Buka (Japanese)' }, codes: ['PNG'], boxes: [[154.5, -6.95, 156.1, -5.2]], from: '1942-04-01', to: '1944-11-22', source: wiki('Bougainville campaign', 'Bougainville_campaign'),
    note: { de: 'Der Brückenkopf der Alliierten bei Torokina (ab November 1943) liegt unter der Kartenauflösung.', en: 'The Allied beachhead at Torokina (from November 1943) is below the map resolution.' } },
  { id: 'bougainville-fighting', contested: true, title: { de: 'Bougainville · australische Offensive seit November 1944', en: 'Bougainville · Australian offensive since November 1944' }, codes: ['PNG'], boxes: [[154.5, -6.95, 156.1, -5.2]], from: '1944-11-22', to: '1945-09-02', source: wiki('Bougainville campaign', 'Bougainville_campaign'),
    note: { de: 'Die Australier übernahmen im November/Dezember 1944 und drängten die Japaner nach Norden und Süden; beide Enklaven hielten bis August 1945.', en: 'The Australians took over in November/December 1944 and pushed the Japanese north and south; both enclaves held until August 1945.' } },
  { id: 'wewak', actor: 'japan', title: { de: 'Raum Wewak (japanisch gehalten)', en: 'Wewak area (Japanese-held)' }, codes: ['PNG'], boxes: [[143.0, -4.3, 144.6, -3.2]], from: '1942-04-01', to: '1945-09-13', source: wiki('Wewak', 'Wewak'),
    note: { de: 'Größter japanischer Flugplatz auf dem Festland Neuguineas; die Kapitulation erfolgte am 13. September 1945 bei Kap Wom.', en: 'The largest Japanese airbase on mainland New Guinea; the surrender took place at Cape Wom on 13 September 1945.' } },
  { id: 'huon-gulf', actor: 'japan', title: { de: 'Lae und Salamaua (japanisch)', en: 'Lae and Salamaua (Japanese)' }, codes: ['PNG'], boxes: [[146.7, -7.2, 147.4, -6.5]], from: '1942-03-08', to: '1943-09-16', source: wiki('Salamaua–Lae campaign', 'Salamaua%E2%80%93Lae_campaign'),
    note: { de: 'Besetzt am 8. März 1942, im September 1943 von australischen und US-Truppen zurückerobert.', en: 'Occupied on 8 March 1942, retaken by Australian and U.S. forces in September 1943.' } },
  { id: 'madang', actor: 'japan', title: { de: 'Madang (japanisch bis April 1944)', en: 'Madang (Japanese until April 1944)' }, codes: ['PNG'], boxes: [[145.3, -5.6, 146.0, -4.9]], from: '1942-04-01', to: '1944-04-24', source: wiki('Madang', 'Madang'),
    note: { de: 'Am 24. April 1944 von australischen Truppen genommen.', en: 'Taken by Australian forces on 24 April 1944.' } },
  { id: 'buna-gona', actor: 'japan', title: { de: 'Buna und Gona (japanischer Brückenkopf)', en: 'Buna and Gona (Japanese beachhead)' }, codes: ['PNG'], boxes: [[148.2, -8.9, 148.8, -8.5]], from: '1942-07-21', to: '1943-01-22', source: wiki('Battle of Buna–Gona', 'Battle_of_Buna%E2%80%93Gona'),
    note: { de: 'Japanische Landung am 21. Juli 1942; der Brückenkopf fiel am 22. Januar 1943.', en: 'Japanese landing on 21 July 1942; the beachhead fell on 22 January 1943.' } },
  // ---- Japan's Pacific mandate and conquests (drawn from Pearl Harbor, 7 December 1941) ------------
  { id: 'marshall-islands-japanese', actor: 'japan', title: { de: 'Marshallinseln (japanisch)', en: 'Marshall Islands (Japanese)' }, codes: ['MHL'], boxes: [[160, 4, 173.5, 15]], from: '1941-12-07', to: '1944-02-23', source: wiki('Gilbert and Marshall Islands campaign', 'Gilbert_and_Marshall_Islands_campaign') },
  { id: 'marshall-islands-allied', actor: 'westernAllies', title: { de: 'Marshallinseln (US-kontrolliert)', en: 'Marshall Islands (U.S.-controlled)' }, codes: ['MHL'], boxes: [[160, 4, 173.5, 15]], from: '1944-02-23', to: '1945-09-02', source: wiki('Gilbert and Marshall Islands campaign', 'Gilbert_and_Marshall_Islands_campaign'),
    note: { de: 'Kwajalein, Majuro und Eniwetok fielen im Februar 1944; vier umgangene Atolle (Jaluit, Mili, Maloelap, Wotje) blieben japanisch und sind nicht gezeichnet.', en: 'Kwajalein, Majuro and Eniwetok fell in February 1944; four bypassed atolls (Jaluit, Mili, Maloelap, Wotje) stayed Japanese and are not drawn.' } },
  { id: 'caroline-islands', actor: 'japan', title: { de: 'Karolinen mit Truk (japanisch, umgangen)', en: 'Caroline Islands with Truk (Japanese, bypassed)' }, codes: ['FSM'], boxes: [[137, 0, 164, 11]], from: '1941-12-07', to: '1945-09-02', source: wiki('Truk Lagoon', 'Truk_Lagoon'),
    note: { de: 'Truk wurde nach der Operation Hailstone (Februar 1944) isoliert, aber nie erobert; die Garnison hielt bis zur Kapitulation.', en: 'Truk was isolated after Operation Hailstone (February 1944) but never invaded; the garrison held until the surrender.' } },
  { id: 'palau-all', actor: 'japan', title: { de: 'Palau (japanisch)', en: 'Palau (Japanese)' }, codes: ['PLW'], boxes: [[131, 2.7, 134.8, 8.1]], from: '1941-12-07', to: '1944-09-15', source: wiki('Mariana and Palau Islands campaign', 'Mariana_and_Palau_Islands_campaign') },
  { id: 'palau-babeldaob', actor: 'japan', title: { de: 'Babeldaob und Koror (japanisch, umgangen)', en: 'Babeldaob and Koror (Japanese, bypassed)' }, codes: ['PLW'], boxes: [[134.3, 7.2, 134.8, 7.8]], from: '1944-09-15', to: '1945-09-02', source: wiki('Mariana and Palau Islands campaign', 'Mariana_and_Palau_Islands_campaign'),
    note: { de: 'Peleliu und Angaur fielen im Herbst 1944; der Rest der Inselgruppe blieb japanisch.', en: 'Peleliu and Angaur fell in autumn 1944; the rest of the group stayed Japanese.' } },
  { id: 'marianas-japanese', actor: 'japan', title: { de: 'Marianen (japanisch)', en: 'Mariana Islands (Japanese)' }, codes: ['MNP'], boxes: [[144.6, 14, 146.3, 20.6]], from: '1941-12-07', to: '1944-07-09', source: wiki('Mariana and Palau Islands campaign', 'Mariana_and_Palau_Islands_campaign') },
  { id: 'saipan-tinian-allied', actor: 'westernAllies', title: { de: 'Saipan und Tinian (US-kontrolliert)', en: 'Saipan and Tinian (U.S.-controlled)' }, codes: ['MNP'], boxes: [[145.5, 14.9, 145.9, 15.4]], from: '1944-07-09', to: '1945-09-02', source: wiki('Mariana and Palau Islands campaign', 'Mariana_and_Palau_Islands_campaign'),
    note: { de: 'Saipan wurde am 9. Juli 1944 für gesichert erklärt, Tinian am 1. August; Rota und die nördlichen Marianen blieben japanisch und sind nicht gezeichnet.', en: 'Saipan was declared secure on 9 July 1944, Tinian on 1 August; Rota and the northern Marianas stayed Japanese and are not drawn.' } },
  { id: 'guam-japanese', actor: 'japan', title: { de: 'Guam (japanisch besetzt)', en: 'Guam (Japanese-occupied)' }, codes: ['GUM'], boxes: [[144.5, 13.2, 145.0, 13.7]], from: '1941-12-10', to: '1944-08-10', source: wiki('Battle of Guam (1944)', 'Battle_of_Guam_(1944)') },
  { id: 'guam-allied', actor: 'westernAllies', title: { de: 'Guam (US-kontrolliert)', en: 'Guam (U.S.-controlled)' }, codes: ['GUM'], boxes: [[144.5, 13.2, 145.0, 13.7]], from: '1944-08-10', to: '1945-09-02', source: wiki('Battle of Guam (1944)', 'Battle_of_Guam_(1944)') },
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
