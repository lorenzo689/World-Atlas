import type { Pose } from './geo'

export type Localized = { de: string; en: string }
export type Ww2Theater = 'europe' | 'north-africa' | 'asia-pacific'

export interface Ww2Source {
  title: string
  url: string
  note: Localized
}

export interface Ww2Front {
  id: string
  theater: Ww2Theater
  title: Localized
  date: string
  /** An original, deliberately coarse interpretation of the cited situation map. Not a survey. */
  line: [number, number][] // [longitude, latitude]
  source: Ww2Source
  precision: 'schematic'
}

export interface Ww2Event {
  id: string
  date: string
  theater: Ww2Theater
  title: Localized
  explanation: Localized
  location: { lat: number; lng: number }
  source: Ww2Source
}

export interface Ww2Moment {
  year: number
  date: string
  title: Localized
  overview: Localized
  people: Localized
  peopleSource: Ww2Source
  question: Localized
  answer: Localized
  focus: Pose
  fronts: Ww2Front[]
  events: Ww2Event[]
}

const armyTimeline: Ww2Source = {
  title: 'U.S. Army Center of Military History · World War II timeline',
  url: 'https://history.army.mil/portals/143/Images/Publications/catalog/69-6-1.pdf',
  note: { de: 'Chronologie wichtiger Kriegsschauplätze; keine Frontgeometrie.', en: 'Chronology of major theaters; not frontline geometry.' },
}
const army1939: Ww2Source = {
  title: 'U.S. Army Military Review · Situation on 16 September 1939',
  url: 'https://www.armyupress.army.mil/Portals/7/online-publications/documents/the-european-war-military-review-december-1939.pdf',
  note: { de: 'Historische Lagekarte zum 16. September; unsere Linie ist eine grobe Eigeninterpretation, kein Nachdruck.', en: 'Historical situation map for 16 September; our line is a coarse original interpretation, not a reprint.' },
}
const westPoint1940: Ww2Source = {
  title: 'U.S. Military Academy · Western Front, 4 June 1940',
  url: 'https://dhc.westpoint.edu/wp-content/uploads/sites/6/2025/01/WWIIEurope13.jpg',
  note: { de: 'Historische Lagekarte als Beleg; unsere Linie ist eine grobe Eigeninterpretation, kein Nachdruck.', en: 'Historical situation map as evidence; our line is a coarse original interpretation, not a reprint.' },
}
const army1941: Ww2Source = {
  title: 'U.S. Army CMH · Moscow to Stalingrad, Map 2',
  url: 'https://history.army.mil/portals/143/Images/Publications/catalog/30-12.pdf',
  note: { de: 'Die Quellkarte bezeichnet die Front vom 12. November ausdrücklich als ungefähr.', en: 'The source map explicitly marks the 12 November front as approximate.' },
}
const army1942: Ww2Source = {
  title: 'U.S. Army CMH · The German Campaign in Russia, Map 17',
  url: 'https://history.army.mil/portals/143/Images/Publications/catalog/104-21.pdf',
  note: { de: 'Lagekarte vom 18. November 1942; hier nur stark vereinfacht.', en: 'Situation map of 18 November 1942; strongly generalized here.' },
}
const battleAtlas = (day: string): Ww2Source => ({
  title: `U.S. Army · Atlas of the World Battle Fronts · ${day}`,
  url: `https://commons.wikimedia.org/wiki/File:${day}GerWW2BattlefrontAtlas.jpg`,
  note: { de: 'US-Armee-Lagekarte; die angezeigten Abschnitte sind grobe Eigeninterpretationen.', en: 'U.S. Army situation map; displayed sections are coarse original interpretations.' },
})

export const WW2_MOMENTS: Ww2Moment[] = [
  {
    year: 1939, date: '1939-09-16',
    title: { de: 'Überfall auf Polen', en: 'Invasion of Poland' },
    overview: { de: 'Die Karte zeigt einen ausgewählten Frontabschnitt bei Warschau Mitte September. Sie zeigt nicht die gesamte polnische Front oder die spätere Besatzung.', en: 'The map shows one selected section near Warsaw in mid-September, not the whole Polish front or subsequent occupation.' },
    people: { de: 'Der Krieg traf Zivilisten unmittelbar: Flucht, Bombardierung und Besatzung gehören zur Geschichte dieses Gebiets.', en: 'The war immediately affected civilians through flight, bombardment and occupation.' },
    peopleSource: { title: 'USHMM · Invasion of Poland, Fall 1939', url: 'https://encyclopedia.ushmm.org/content/en/article/invasion-of-poland-fall-1939?series=7', note: { de: 'Besatzung Polens und Folgen für die Bevölkerung.', en: 'Occupation of Poland and consequences for its people.' } },
    question: { de: 'Warum ist die Linie bei Warschau keine neue Staatsgrenze?', en: 'Why is the line near Warsaw not a new state border?' },
    answer: { de: 'Sie steht für eine militärische Lage während eines Angriffs. Die Souveränität Polens und die Besatzung sind andere Kartenebenen.', en: 'It represents a military situation during an invasion. Polish sovereignty and occupation are different map layers.' },
    focus: { lat: 52, lng: 20, altitude: 0.85 },
    fronts: [{ id: 'warsaw-1939', theater: 'europe', title: { de: 'Raum Warschau', en: 'Warsaw area' }, date: '1939-09-16', line: [[20.35, 52.46], [20.39, 52.27], [20.7, 52.16], [20.91, 52.08]], source: army1939, precision: 'schematic' }],
    events: [{ id: 'poland-invasion', date: '1939-09-01', theater: 'europe', title: { de: 'Beginn des deutschen Angriffs auf Polen', en: 'Germany invades Poland' }, explanation: { de: 'Der Angriff beginnt den Krieg in Europa. Die Karte zeigt einen späteren, datierten Ausschnitt der Kämpfe.', en: 'The invasion begins the war in Europe. The map shows a later, dated section of the fighting.' }, location: { lat: 52.2, lng: 21 }, source: armyTimeline }],
  },
  {
    year: 1940, date: '1940-06-04',
    title: { de: 'Krieg in Westeuropa', en: 'War in Western Europe' },
    overview: { de: 'Ein schematischer Abschnitt an Somme und Aisne zeigt die Lage Anfang Juni, nicht die schnell folgenden Veränderungen bis zum Waffenstillstand.', en: 'A schematic Somme–Aisne section shows the early-June situation, not the rapid changes leading to the armistice.' },
    people: { de: 'In Frankreich und den Benelux-Ländern führten Angriffe und Besatzung zu massiver Flucht und Verfolgung.', en: 'In France and the Low Countries, attacks and occupation led to mass flight and persecution.' },
    peopleSource: { title: 'USHMM · France', url: 'https://encyclopedia.ushmm.org/content/en/article/france', note: { de: 'Flucht und Verfolgung in Frankreich.', en: 'Flight and persecution in France.' } },
    question: { de: 'Was würde eine einzige „Karte von 1940“ hier verschweigen?', en: 'What would a single “1940 map” hide here?' },
    answer: { de: 'Die Front verschob sich binnen Wochen. Deshalb zeigt die Karte den 4. Juni als Stichtag und keinen Zustand für das ganze Jahr.', en: 'The front shifted within weeks. This map is dated 4 June, not a claim about the entire year.' },
    focus: { lat: 49.5, lng: 2.5, altitude: 0.75 },
    fronts: [{ id: 'sommes-1940', theater: 'europe', title: { de: 'Somme–Aisne', en: 'Somme–Aisne' }, date: '1940-06-04', line: [[1.5, 50.1], [2.2, 49.95], [2.7, 49.88], [3.25, 49.6], [3.95, 49.5], [4.35, 49.55]], source: westPoint1940, precision: 'schematic' }],
    events: [{ id: 'fall-france', date: '1940-05-10', theater: 'europe', title: { de: 'Deutscher Angriff im Westen', en: 'German offensive in the West' }, explanation: { de: 'Die Westoffensive verändert die militärische Lage innerhalb weniger Wochen.', en: 'The offensive changes the military situation within weeks.' }, location: { lat: 49.6, lng: 4.6 }, source: armyTimeline }],
  },
  {
    year: 1941, date: '1941-11-12',
    title: { de: 'Krieg gegen die Sowjetunion', en: 'War against the Soviet Union' },
    overview: { de: 'Der Frontverlauf ist eine sehr grobe Übersicht für den 12. November – keine taktische Stellung und keine Darstellung aller eingeschlossenen Gebiete.', en: 'The line is a very coarse overview for 12 November, not a tactical position or a map of every pocket.' },
    people: { de: 'Der deutsche Vernichtungskrieg brachte Massenmord, Hunger, Deportation und Zerstörung über die besetzten Gebiete.', en: 'The German war of annihilation brought mass murder, starvation, deportation and destruction to occupied areas.' },
    peopleSource: { title: 'USHMM · The Soviet Union and the Eastern Front', url: 'https://encyclopedia.ushmm.org/content/en/article/the-soviet-union-and-the-eastern-front', note: { de: 'Vernichtungskrieg und Gewalt gegen Zivilisten.', en: 'War of annihilation and violence against civilians.' } },
    question: { de: 'Was kann eine Frontlinie nicht zeigen?', en: 'What can a frontline not show?' },
    answer: { de: 'Sie zeigt weder das Leben unter Besatzung noch das Ausmaß der Gewalt gegen Zivilisten.', en: 'It cannot show life under occupation or the extent of violence against civilians.' },
    focus: { lat: 53, lng: 33, altitude: 1.45 },
    fronts: [{ id: 'east-1941', theater: 'europe', title: { de: 'Ostfront, grobe Übersicht', en: 'Eastern Front, broad overview' }, date: '1941-11-12', line: [[30.2, 59.5], [31.5, 57.8], [31.8, 56.4], [35.2, 55.6], [37.7, 54.6], [38.4, 52.7], [38.7, 50.4], [38.1, 48.2], [39.4, 47.2]], source: army1941, precision: 'schematic' }],
    events: [{ id: 'barbarossa', date: '1941-06-22', theater: 'europe', title: { de: 'Deutscher Angriff auf die Sowjetunion', en: 'Germany invades the Soviet Union' }, explanation: { de: 'Die Offensive eröffnet einen Kriegsschauplatz von enormer Ausdehnung.', en: 'The offensive opens a theater of enormous scale.' }, location: { lat: 50.5, lng: 30.5 }, source: armyTimeline }, { id: 'pearl-harbor', date: '1941-12-07', theater: 'asia-pacific', title: { de: 'Angriff auf Pearl Harbor', en: 'Attack on Pearl Harbor' }, explanation: { de: 'Ein wichtiges Ereignis im Pazifikkrieg; auf See gibt es keine durchgehende Frontlinie wie an Land.', en: 'A major Pacific War event; at sea there is no continuous land-style front line.' }, location: { lat: 21.36, lng: -157.95 }, source: armyTimeline }],
  },
  {
    year: 1942, date: '1942-11-18',
    title: { de: 'Wendepunkte an mehreren Fronten', en: 'Turning points in several theaters' },
    overview: { de: 'Ein Abschnitt zeigt die Lage am 18. November an der Ostfront. Nordafrika und der Pazifik erscheinen als Ereignisorte; dort wird keine unbelegte durchgehende Linie erfunden.', en: 'A section shows the 18 November Eastern Front. North Africa and the Pacific appear as event locations, without inventing unsupported continuous lines.' },
    people: { de: 'Stalingrad und Nordafrika stehen für sehr unterschiedliche Kriegsschauplätze; beide betrafen Soldaten und Zivilbevölkerung.', en: 'Stalingrad and North Africa are very different theaters, both affecting soldiers and civilians.' },
    peopleSource: { title: 'U.S. Army CMH · World War II theater campaigns', url: 'https://history.army.mil/Research/Reference-Topics/Army-Campaigns/Brief-Summaries/World-War-II/World-War-II-European-African-Middle-Eastern-Theater/', note: { de: 'Getrennte Kriegsschauplätze und Feldzüge.', en: 'Distinct theaters and campaigns.' } },
    question: { de: 'Warum erhält der Pazifik hier Punkte statt einer Welt-Frontlinie?', en: 'Why does the Pacific have event points instead of a world-spanning frontline?' },
    answer: { de: 'Inseln, See- und Luftoperationen lassen sich nicht sinnvoll als eine zusammenhängende Landfront zeichnen.', en: 'Island, naval and air operations cannot meaningfully be drawn as one continuous land front.' },
    focus: { lat: 50, lng: 37, altitude: 1.35 },
    fronts: [{ id: 'east-1942', theater: 'europe', title: { de: 'Ostfront, ausgewählte Abschnitte', en: 'Eastern Front, selected sections' }, date: '1942-11-18', line: [[30.9, 59.5], [30.9, 57.5], [31.4, 56], [33.5, 54.5], [35, 53.5], [38.5, 51.7], [40.5, 50.2], [43.5, 48.7], [44.6, 48.7]], source: army1942, precision: 'schematic' }],
    events: [{ id: 'stalingrad', date: '1942-11-19', theater: 'europe', title: { de: 'Sowjetische Gegenoffensive bei Stalingrad', en: 'Soviet counteroffensive at Stalingrad' }, explanation: { de: 'Die Offensive verändert die Lage unmittelbar nach dem Kartenstichtag.', en: 'The offensive changes the situation immediately after the map date.' }, location: { lat: 48.71, lng: 44.51 }, source: army1942 }, { id: 'el-alamein', date: '1942-10-23', theater: 'north-africa', title: { de: 'Zweite Schlacht von El Alamein', en: 'Second Battle of El Alamein' }, explanation: { de: 'Ein Wendepunkt in Nordafrika. Ohne geprüfte Polygon- oder Linienquelle zeigen wir hier einen Ort, keine präzise Front.', en: 'A North African turning point. Without validated line or polygon geometry, the map shows a location rather than a precise front.' }, location: { lat: 30.83, lng: 28.95 }, source: armyTimeline }, { id: 'midway', date: '1942-06-03', theater: 'asia-pacific', title: { de: 'Schlacht um Midway', en: 'Battle of Midway' }, explanation: { de: 'Eine See- und Luftschlacht; eine Landfront wäre hierfür irreführend.', en: 'A naval and air battle; a land-style frontline would mislead.' }, location: { lat: 28.2, lng: -177.4 }, source: armyTimeline }],
  },
  {
    year: 1943, date: '1943-12-15',
    title: { de: 'Rückzug im Osten, Kämpfe in Italien', en: 'Retreat in the East, fighting in Italy' },
    overview: { de: 'Die schematische Ostfront orientiert sich am US-Armee-Atlas vom 15. Dezember. Kleine Frontvorsprünge, Partisanengebiete und Italien sind in dieser Linie nicht enthalten.', en: 'The schematic Eastern Front follows the U.S. Army atlas of 15 December. Small salients, partisan areas and Italy are not represented in this line.' },
    people: { de: 'Rückzug und Gegenoffensiven beendeten die Gewalt gegen Zivilisten nicht; Besatzung und Verfolgung dauerten an.', en: 'Retreat and counteroffensives did not end violence against civilians; occupation and persecution continued.' },
    peopleSource: { title: 'USHMM · Einsatzgruppen in the Soviet Union', url: 'https://encyclopedia.ushmm.org/content/en/article/einsatzgruppen-and-other-ss-and-police-units-in-the-soviet-union', note: { de: 'Verbrechen während des deutschen Rückzugs.', en: 'Crimes during the German retreat.' } },
    question: { de: 'Warum ist „die Ostfront“ auf einer Weltkarte nur eine Übersicht?', en: 'Why is “the Eastern Front” on a globe only an overview?' },
    answer: { de: 'Eine über tausend Kilometer lange Front enthielt zahlreiche lokale Unterschiede und wechselte ständig.', en: 'A front stretching over a thousand kilometers had many local differences and changed constantly.' },
    focus: { lat: 51, lng: 29, altitude: 1.25 },
    fronts: [{ id: 'east-1943', theater: 'europe', title: { de: 'Ostfront, grobe Übersicht', en: 'Eastern Front, broad overview' }, date: '1943-12-15', line: [[30.5, 59.4], [29.6, 56.7], [30.4, 55.7], [30.3, 54.2], [31.5, 52.6], [29.7, 50.4], [30.4, 48.7], [32.7, 47.9], [34.5, 46.9]], source: battleAtlas('1943-12-15'), precision: 'schematic' }],
    events: [{ id: 'italy-1943', date: '1943-09-09', theater: 'europe', title: { de: 'Alliierte Landung bei Salerno', en: 'Allied landing at Salerno' }, explanation: { de: 'Der Krieg in Italien folgt einem anderen Verlauf als an der Ostfront.', en: 'The campaign in Italy follows a different course from the Eastern Front.' }, location: { lat: 40.68, lng: 14.76 }, source: armyTimeline }],
  },
  {
    year: 1944, date: '1944-12-15',
    title: { de: 'Zwei Fronten rücken auf Deutschland zu', en: 'Two fronts approach Germany' },
    overview: { de: 'Ausgewählte West- und Ostfrontabschnitte vom 15. Dezember. Die später beginnende Ardennenoffensive ist hier noch nicht eingezeichnet.', en: 'Selected Western and Eastern Front sections on 15 December. The later Ardennes offensive is not yet shown.' },
    people: { de: 'Befreiung, fortgesetzte Besatzung und Gewalt lagen räumlich und zeitlich dicht beieinander.', en: 'Liberation, continuing occupation and violence occurred close together in space and time.' },
    peopleSource: { title: 'USHMM · 1944: Key Dates', url: 'https://encyclopedia.ushmm.org/content/en/article/1944-key-dates', note: { de: 'Verfolgung, Widerstand und Befreiung 1944.', en: 'Persecution, resistance and liberation in 1944.' } },
    question: { de: 'Warum ist das Datum 15. Dezember für die Westfront wichtig?', en: 'Why does 15 December matter for the Western Front?' },
    answer: { de: 'Schon am nächsten Tag begann die Ardennenoffensive; eine Jahreskarte ohne Stichtag würde das verbergen.', en: 'The Ardennes offensive began the next day; an undated annual map would conceal that.' },
    focus: { lat: 51.5, lng: 15.5, altitude: 1.05 },
    fronts: [
      { id: 'west-1944', theater: 'europe', title: { de: 'Westfront', en: 'Western Front' }, date: '1944-12-15', line: [[5.8, 51.5], [6.4, 50.9], [6.05, 50.2], [6.7, 49.5], [7.3, 48.9], [7.7, 48.1]], source: battleAtlas('1944-12-15'), precision: 'schematic' },
      { id: 'east-1944', theater: 'europe', title: { de: 'Ostfront, ausgewählte Abschnitte', en: 'Eastern Front, selected sections' }, date: '1944-12-15', line: [[21.5, 56.1], [23.6, 54.5], [23.7, 53.5], [22.5, 52.3], [21.1, 51.7], [20.7, 50.7], [21.4, 49.5]], source: battleAtlas('1944-12-15'), precision: 'schematic' },
    ],
    events: [{ id: 'normandy', date: '1944-06-06', theater: 'europe', title: { de: 'Landung in der Normandie', en: 'Normandy landings' }, explanation: { de: 'Sie eröffnet die alliierte Offensive in Nordwesteuropa; die Dezemberkarte zeigt einen deutlich späteren Stand.', en: 'It opens the Allied offensive in northwestern Europe; the December map shows a much later situation.' }, location: { lat: 49.35, lng: -0.65 }, source: { title: 'Library of Congress · WWII Military Situation Maps', url: 'https://www.loc.gov/collections/world-war-ii-maps-military-situation-maps-from-1944-to-1945/about-this-collection/', note: { de: 'Täglich datierte Lagekarten ab 6. Juni 1944.', en: 'Daily dated situation maps starting 6 June 1944.' } } }],
  },
  {
    year: 1945, date: '1945-04-15',
    title: { de: 'Letzte Kriegswochen in Europa', en: 'Final weeks of the war in Europe' },
    overview: { de: 'Die beiden Abschnitte zeigen die Lage Mitte April. Der Krieg in Europa endete später; der Krieg gegen Japan dauerte darüber hinaus an.', en: 'Two sections show the situation in mid-April. The war in Europe ended later, while the war against Japan continued.' },
    people: { de: 'Auch in den letzten Kriegswochen starben Menschen durch Kampfhandlungen, Verfolgung und Todesmärsche.', en: 'People continued to die from combat, persecution and death marches in the final weeks.' },
    peopleSource: { title: 'USHMM · Death Marches', url: 'https://encyclopedia.ushmm.org/content/en/article/death-marches-1', note: { de: 'Todesmärsche 1944–45.', en: 'Death marches in 1944–45.' } },
    question: { de: 'Warum endet die Weltkriegskarte nicht am Ende des Krieges in Europa?', en: 'Why does the World War II map not end with the war in Europe?' },
    answer: { de: 'Der Krieg in Asien und im Pazifik dauerte bis September 1945.', en: 'The war in Asia and the Pacific continued until September 1945.' },
    focus: { lat: 51.6, lng: 12.8, altitude: 0.9 },
    fronts: [
      { id: 'west-1945', theater: 'europe', title: { de: 'Westfront, ausgewählter Abschnitt', en: 'Western Front, selected section' }, date: '1945-04-15', line: [[9.6, 53.8], [10.4, 52.7], [11.1, 51.7], [11.5, 50.6], [11.6, 49.6], [11.4, 48.7]], source: battleAtlas('1945-04-15'), precision: 'schematic' },
      { id: 'east-1945', theater: 'europe', title: { de: 'Ostfront, ausgewählter Abschnitt', en: 'Eastern Front, selected section' }, date: '1945-04-15', line: [[14.2, 53.7], [14.4, 52.8], [14.55, 52.1], [14.7, 51.5], [15.3, 50.9], [16.3, 50.2]], source: battleAtlas('1945-04-15'), precision: 'schematic' },
    ],
    events: [{ id: 'berlin-1945', date: '1945-04-16', theater: 'europe', title: { de: 'Beginn der Berliner Operation', en: 'Start of the Battle of Berlin' }, explanation: { de: 'Die Lage änderte sich unmittelbar nach dem Kartenstichtag.', en: 'The situation changed immediately after the map date.' }, location: { lat: 52.52, lng: 13.41 }, source: { title: 'U.S. Army CMH · Chronology 1941–1945', url: 'https://history.army.mil/portals/143/Images/Publications/catalog/11-1.pdf', note: { de: 'Chronologie: Offensive an Oder und Neiße am 16. April.', en: 'Chronology: offensive along the Oder and Neisse on 16 April.' } } }, { id: 'okinawa-1945', date: '1945-04-15', theater: 'asia-pacific', title: { de: 'Kämpfe auf Okinawa', en: 'Fighting on Okinawa' }, explanation: { de: 'Der Pazifikkrieg dauerte an. Wir zeichnen für die Insel keine erfundene globale Frontlinie.', en: 'The Pacific War continued. We do not draw a fictitious global front around the island.' }, location: { lat: 26.21, lng: 127.68 }, source: { title: 'U.S. Army · World Battle Fronts · Okinawa', url: 'https://commons.wikimedia.org/wiki/File:1945-04-15JapOKWW2BattlefrontAtlas.jpg', note: { de: 'Datiertes Lagebild für Okinawa.', en: 'Dated situation map for Okinawa.' } } }],
  },
]

export function ww2Moment(year: number | null): Ww2Moment | null {
  return WW2_MOMENTS.find((moment) => moment.year === year) ?? null
}
