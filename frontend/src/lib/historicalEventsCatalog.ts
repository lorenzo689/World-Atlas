import type { EventRegion, EventTheme, HistoricalEvent, Localized } from './historicalEvents'

/**
 * Sourced events added to the catalog. Every date was read on the cited page (U.S. Office of the
 * Historian unless stated otherwise); see docs/HISTORY.md for the verification log.
 *
 * Where the source dates only the United States' recognition of a state, the event is the
 * recognition and says so: recognition and independence can fall on different days. No source here
 * names a place precise enough for coordinates, so none of these events has a globe marker.
 */
type Source = HistoricalEvent['source']

const country = (slug: string, label: string): Source => ({ title: `U.S. Office of the Historian · ${label}`, url: `https://history.state.gov/countries/${slug}` })
// Labelled by the Milestones period, not by an essay title, which was not recorded verbatim.
const milestone = (path: string): Source => ({ title: `U.S. Office of the Historian · Milestones ${path.split('/')[0].replace('-', '–')}`, url: `https://history.state.gov/milestones/${path}` })

function event(id: string, date: string, region: EventRegion, themes: EventTheme[], title: Localized, description: Localized, source: Source): HistoricalEvent {
  return { id, date, title, description, location: null, region, themes, source, origin: 'catalog', compare: null, storyId: null, focus: null, entities: [] }
}

/** U.S. recognition, dated as the country page records it. `whom` completes "The United States recognized …". */
function recognition(id: string, date: string, region: EventRegion, name: Localized, whom: Localized, slug: string): HistoricalEvent {
  return event(id, date, region, ['statehood', 'diplomacy'],
    { en: `United States recognizes ${name.en}`, de: `Vereinigte Staaten erkennen ${name.de} an` },
    {
      en: `The United States recognized ${whom.en} on this date. The entry is dated by this recognition as the source records it; independence and recognition can fall on different days.`,
      de: `Die Vereinigten Staaten erkannten an diesem Tag ${whom.de} an. Der Eintrag ist nach dieser Anerkennung datiert, wie die Quelle sie festhält; Unabhängigkeit und Anerkennung können auf verschiedene Tage fallen.`,
    },
    country(slug, name.en))
}

export const ADDITIONAL_EVENTS: HistoricalEvent[] = [
  // ---- Africa -------------------------------------------------------------------------------
  event('libya-1951', '1951-12-24', 'africa', ['statehood'],
    { en: 'Libya declares independence', de: 'Libyen erklärt seine Unabhängigkeit' },
    { en: 'Libya declared its independence; the United States recognized the United Kingdom of Libya the same day.', de: 'Libyen erklärte seine Unabhängigkeit; die Vereinigten Staaten erkannten das Vereinigte Königreich Libyen am selben Tag an.' },
    country('libya', 'Libya')),
  recognition('sudan-1956', '1956-01-01', 'africa', { en: 'Sudan', de: 'den Sudan' }, { en: 'the Republic of Sudan', de: 'die Republik Sudan' }, 'sudan'),
  event('morocco-1956', '1956-03-02', 'africa', ['statehood', 'diplomacy'],
    { en: 'France recognizes Moroccan independence', de: 'Frankreich erkennt die Unabhängigkeit Marokkos an' },
    { en: 'In the Franco-Moroccan declaration of 2 March 1956, France recognized Moroccan independence. The United States followed on 7 March.', de: 'In der französisch-marokkanischen Erklärung vom 2. März 1956 erkannte Frankreich die Unabhängigkeit Marokkos an. Die Vereinigten Staaten folgten am 7. März.' },
    country('morocco', 'Morocco')),
  recognition('tunisia-1956', '1956-03-22', 'africa', { en: 'Tunisia', de: 'Tunesien' }, { en: 'Tunisia’s independence from France', de: 'die Unabhängigkeit Tunesiens von Frankreich' }, 'tunisia'),
  recognition('guinea-1958', '1958-11-01', 'africa', { en: 'Guinea', de: 'Guinea' }, { en: 'the Republic of Guinea', de: 'die Republik Guinea' }, 'guinea'),
  recognition('congo-1960', '1960-06-30', 'africa', { en: 'the Congo', de: 'den Kongo' }, { en: 'the Republic of Congo (today the Democratic Republic of the Congo)', de: 'die Republik Kongo (heute Demokratische Republik Kongo)' }, 'congo-democratic-republic'),
  recognition('nigeria-1960', '1960-10-01', 'africa', { en: 'Nigeria', de: 'Nigeria' }, { en: 'the Federation of Nigeria', de: 'die Föderation Nigeria' }, 'nigeria'),
  event('south-africa-republic-1961', '1961-05-31', 'africa', ['statehood', 'politics'],
    { en: 'South Africa declared a republic', de: 'Südafrika wird zur Republik erklärt' },
    { en: 'The Government of the Union of South Africa declared that the country would henceforth be a republic.', de: 'Die Regierung der Südafrikanischen Union erklärte, das Land sei fortan eine Republik.' },
    country('south-africa', 'South Africa')),
  recognition('tanganyika-1961', '1961-12-09', 'africa', { en: 'Tanganyika', de: 'Tanganjika' }, { en: 'Tanganyika (today part of Tanzania)', de: 'Tanganjika (heute Teil Tansanias)' }, 'tanzania'),
  recognition('algeria-1962', '1962-07-03', 'africa', { en: 'Algeria', de: 'Algerien' }, { en: 'Algeria', de: 'Algerien' }, 'algeria'),
  event('kenya-1963', '1963-12-12', 'africa', ['statehood'],
    { en: 'Kenya becomes independent', de: 'Kenia wird unabhängig' },
    { en: 'Kenya gained its independence; the United States recognized it the same day.', de: 'Kenia wurde unabhängig; die Vereinigten Staaten erkannten es am selben Tag an.' },
    country('kenya', 'Kenya')),
  recognition('mozambique-1975', '1975-06-25', 'africa', { en: 'Mozambique', de: 'Mosambik' }, { en: 'the People’s Republic of Mozambique', de: 'die Volksrepublik Mosambik' }, 'mozambique'),
  event('angola-1975', '1975-11-11', 'africa', ['statehood'],
    { en: 'Portugal grants Angola independence', de: 'Portugal entlässt Angola in die Unabhängigkeit' },
    { en: 'Portugal granted Angola independence. The United States did not recognize the government declared by the MPLA at the time; it recognized the Government of Angola on 19 May 1993.', de: 'Portugal entließ Angola in die Unabhängigkeit. Die Vereinigten Staaten erkannten die damals von der MPLA ausgerufene Regierung nicht an; sie erkannten die Regierung Angolas am 19. Mai 1993 an.' },
    country('angola', 'Angola')),
  recognition('zimbabwe-1980', '1980-04-18', 'africa', { en: 'Zimbabwe', de: 'Simbabwe' }, { en: 'the Republic of Zimbabwe', de: 'die Republik Simbabwe' }, 'zimbabwe'),
  recognition('namibia-1990', '1990-03-21', 'africa', { en: 'Namibia', de: 'Namibia' }, { en: 'Namibia', de: 'Namibia' }, 'namibia'),

  // ---- Asia ---------------------------------------------------------------------------------
  recognition('philippines-1946', '1946-07-04', 'asia-pacific', { en: 'the Philippines', de: 'die Philippinen' }, { en: 'the Republic of the Philippines as an independent state', de: 'die Republik der Philippinen als unabhängigen Staat' }, 'philippines'),
  recognition('burma-1948', '1948-01-04', 'asia-pacific', { en: 'Burma', de: 'Birma' }, { en: 'the Union of Burma as an independent sovereign state', de: 'die Union Birma als unabhängigen souveränen Staat' }, 'burma'),
  recognition('ceylon-1948', '1948-02-04', 'asia-pacific', { en: 'Ceylon (Sri Lanka)', de: 'Ceylon (Sri Lanka)' }, { en: 'Ceylon (Sri Lanka) as an independent state', de: 'Ceylon (Sri Lanka) als unabhängigen Staat' }, 'sri-lanka'),
  event('prc-1949', '1949-10-01', 'asia-pacific', ['statehood', 'politics'],
    { en: 'People’s Republic of China proclaimed', de: 'Volksrepublik China ausgerufen' },
    { en: 'Chinese Communist leader Mao Zedong declared the creation of the People’s Republic of China.', de: 'Der chinesische Kommunistenführer Mao Zedong verkündete die Gründung der Volksrepublik China.' },
    milestone('1945-1952/chinese-rev')),
  recognition('indonesia-1949', '1949-12-28', 'asia-pacific', { en: 'Indonesia', de: 'Indonesien' }, { en: 'the Republic of the United States of Indonesia', de: 'die Republik der Vereinigten Staaten von Indonesien' }, 'indonesia'),
  recognition('singapore-1965', '1965-08-11', 'asia-pacific', { en: 'Singapore', de: 'Singapur' }, { en: 'the newly independent and sovereign state of Singapore', de: 'den neu unabhängigen, souveränen Staat Singapur' }, 'singapore'),

  // ---- Middle East --------------------------------------------------------------------------
  event('saudi-arabia-1932', '1932-09-18', 'middle-east', ['statehood'],
    { en: 'Kingdom of Saudi Arabia named by decree', de: 'Königreich Saudi-Arabien per Dekret benannt' },
    { en: 'A decree changed the name of the state to the Kingdom of Saudi Arabia.', de: 'Ein Dekret änderte den Namen des Staates in Königreich Saudi-Arabien.' },
    country('saudi-arabia', 'Saudi Arabia')),
  event('jordan-1946', '1946-05-25', 'middle-east', ['statehood'],
    { en: 'Transjordan declares independence', de: 'Transjordanien erklärt seine Unabhängigkeit' },
    { en: 'Transjordan declared its independence with the agreement of Great Britain.', de: 'Transjordanien erklärte mit Zustimmung Großbritanniens seine Unabhängigkeit.' },
    country('jordan', 'Jordan')),
  event('israel-1948', '1948-05-14', 'middle-east', ['statehood'],
    { en: 'State of Israel proclaimed', de: 'Staat Israel ausgerufen' },
    { en: 'David Ben-Gurion, head of the Jewish Agency, proclaimed the establishment of the State of Israel.', de: 'David Ben-Gurion, Leiter der Jewish Agency, verkündete die Gründung des Staates Israel.' },
    milestone('1945-1952/creation-israel')),
  event('suez-1956', '1956-10-29', 'middle-east', ['war'],
    { en: 'Suez Crisis: Israeli attack across Sinai', de: 'Suezkrise: israelischer Angriff über den Sinai' },
    { en: 'Israeli forces attacked across Egypt’s Sinai Peninsula during the Suez Crisis.', de: 'Israelische Truppen griffen während der Suezkrise über die ägyptische Sinai-Halbinsel an.' },
    milestone('1953-1960/suez')),
  event('six-day-war-1967', '1967-06-05', 'middle-east', ['war'],
    { en: 'Six-Day War begins', de: 'Beginn des Sechstagekriegs' },
    { en: 'Between 5 and 10 June 1967 Israel defeated Egypt, Jordan and Syria. Military control after the war is not shown as a change of state borders.', de: 'Zwischen dem 5. und 10. Juni 1967 besiegte Israel Ägypten, Jordanien und Syrien. Militärische Kontrolle nach dem Krieg wird nicht als Änderung von Staatsgrenzen dargestellt.' },
    milestone('1961-1968/arab-israeli-war-1967')),
  event('camp-david-1978', '1978-09-05', 'middle-east', ['diplomacy'],
    { en: 'Camp David Summit begins', de: 'Beginn des Gipfels von Camp David' },
    { en: 'The Camp David Summit was held from 5 to 17 September 1978; the accords were signed in September 1978.', de: 'Der Gipfel von Camp David fand vom 5. bis 17. September 1978 statt; die Abkommen wurden im September 1978 unterzeichnet.' },
    milestone('1977-1980/camp-david')),
  event('kuwait-invasion-1990', '1990-08-02', 'middle-east', ['war'],
    { en: 'Iraq invades Kuwait', de: 'Irak überfällt Kuwait' },
    { en: 'A force of one hundred thousand Iraqi troops invaded Kuwait. Occupation is not shown as a change of state borders.', de: 'Rund hunderttausend irakische Soldaten fielen in Kuwait ein. Besatzung wird nicht als Änderung von Staatsgrenzen dargestellt.' },
    milestone('1989-1992/gulf-war')),
  event('oslo-1993', '1993-09-13', 'middle-east', ['diplomacy'],
    { en: 'Oslo Declaration of Principles signed', de: 'Oslo-Prinzipienerklärung unterzeichnet' },
    { en: 'A Declaration of Principles was signed at the White House.', de: 'Im Weißen Haus wurde eine Prinzipienerklärung unterzeichnet.' },
    milestone('1993-2000/oslo')),

  // ---- Americas -----------------------------------------------------------------------------
  event('spanish-american-war-1898', '1898-04-25', 'americas', ['war'],
    { en: 'U.S. Congress votes for war with Spain', de: 'US-Kongress beschließt Krieg gegen Spanien' },
    { en: 'The U.S. Congress voted to go to war against Spain.', de: 'Der US-Kongress stimmte für den Krieg gegen Spanien.' },
    milestone('1866-1898/spanish-american-war')),
  event('panama-1903', '1903-11-03', 'americas', ['statehood'],
    { en: 'Panama declares independence from Colombia', de: 'Panama erklärt seine Unabhängigkeit von Kolumbien' },
    { en: 'Panama declared independence from Colombia.', de: 'Panama erklärte seine Unabhängigkeit von Kolumbien.' },
    milestone('1899-1913/panama-canal')),
  event('jamaica-1962', '1962-08-06', 'americas', ['statehood'],
    { en: 'Jamaica becomes independent', de: 'Jamaika wird unabhängig' },
    { en: 'Jamaica became independent, remaining a member of the British Commonwealth.', de: 'Jamaika wurde unabhängig und blieb Mitglied des Commonwealth.' },
    country('jamaica', 'Jamaica')),
  event('trinidad-tobago-1962', '1962-08-31', 'americas', ['statehood'],
    { en: 'Trinidad and Tobago becomes independent', de: 'Trinidad und Tobago wird unabhängig' },
    { en: 'Trinidad and Tobago became independent; the United States recognized it the same day.', de: 'Trinidad und Tobago wurde unabhängig; die Vereinigten Staaten erkannten es am selben Tag an.' },
    country('trinidad-and-tobago', 'Trinidad and Tobago')),
  event('cuban-missile-crisis-1962', '1962-10-28', 'americas', ['diplomacy'],
    { en: 'Cuban Missile Crisis: Khrushchev announces dismantling', de: 'Kubakrise: Chruschtschow kündigt Abbau an' },
    { en: 'Khrushchev issued a public statement that Soviet missiles in Cuba would be dismantled.', de: 'Chruschtschow erklärte öffentlich, die sowjetischen Raketen auf Kuba würden abgebaut.' },
    milestone('1961-1968/cuban-missile-crisis')),
  event('chile-coup-1973', '1973-09-11', 'americas', ['politics'],
    { en: 'Military coup in Chile', de: 'Militärputsch in Chile' },
    { en: 'The military launched a coup against the Allende government.', de: 'Das Militär putschte gegen die Regierung Allende.' },
    milestone('1969-1976/allende')),
  event('panama-canal-treaties-1977', '1977-09-07', 'americas', ['diplomacy'],
    { en: 'Panama Canal Treaties signed', de: 'Panamakanal-Verträge unterzeichnet' },
    { en: 'Two treaties on the Panama Canal were signed.', de: 'Zwei Verträge über den Panamakanal wurden unterzeichnet.' },
    milestone('1977-1980/panama-canal')),
  event('belize-1981', '1981-09-21', 'americas', ['statehood'],
    { en: 'Belize becomes independent', de: 'Belize wird unabhängig' },
    { en: 'Belize achieved full independence from the United Kingdom.', de: 'Belize erlangte die volle Unabhängigkeit vom Vereinigten Königreich.' },
    country('belize', 'Belize')),
]
