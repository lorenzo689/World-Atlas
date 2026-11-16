// Which side each CShapes unit (state or colony) was on, by date, for the WWII scenario colours.
//
//   axis    – Axis powers and their colonies           -> dark red  (state territory)
//   allied  – states at war with the Axis, colonies     -> dark blue (state territory)
//   axisOccupied / alliedControl – a unit held by the other side as a whole (e.g. Japanese conquests,
//            British-occupied Iceland)                 -> red / blue
//   contested – fighting over the unit on that date    -> amber
// Units not listed on a date (neutrals, Vichy France 1940–42, the USSR before 22 June 1941, Finland
// after its armistice) carry no colour: no claim. Each entry: [CShapes names], role, from, to
// (from <= date < to), reason. Dates are entry into the war / change of side / conquest.
const ALL_TIME = '2100-01-01'

const BRITISH_EMPIRE = ['India', 'Sri Lanka (Ceylon)', 'Aden', 'East Aden Protectorate', 'British Somaliland (Somaliland Republic)', 'Kenya', 'Uganda',
  'Tanzania (Tanganyika)', 'Zanzibar', 'Nigeria', 'Ghana', 'Sierra Leone', 'Gambia', 'British Cameroons', 'British Togoland', 'Sudan', 'Malawi', 'Zambia',
  'Zimbabwe (Rhodesia)', 'Botswana', 'Lesotho', 'Swaziland (Eswatini)', 'Palestine', 'Jordan', 'Cyprus', 'Malta', 'Belize', 'Guyana', 'Jamaica',
  'Trinidad and Tobago', 'Bahamas', 'Barbados', 'Newfoundland', 'Fiji', 'Solomon Islands', 'Mauritius', 'Maldives', 'Papua',
  'New Guinea (German New Guinea) (Kaiser Wilhelmsland)', 'Namibia']
const BRITISH_SOUTHEAST_ASIA = ['Federated Malay States', 'Unfederated Malay States', 'Straits Settlements', 'Sabah (North Borneo)', 'Sarawak', 'Brunei']
const FRENCH_EQUATORIAL = ['Chad', 'Gabon', 'Congo', 'Central African Republic', 'Cameroon', 'New Caledonia and Dependencies', 'French Polynesia']
const FRENCH_WEST_AFRICA = ['Senegal', 'Mali', 'Guinea', "Cote D'Ivoire", 'Benin', 'Niger', 'Mauritania', 'Togo', 'Djibouti', 'Morocco', 'Algeria']
const FRENCH_CARIBBEAN = ['Guadeloupe', 'Martinique', 'French Guyana', 'Inini']
const INDOCHINA = ['Vietnam (Annam/Cochin China/Tonkin)', 'Cambodia (Kampuchea)', 'Laos']
const JAPANESE_EMPIRE = ['Japan', 'Korea', 'Taiwan', 'Southern Sakhalin Island']
const DECEMBER_1941_AMERICAS = ['Cuba', 'Dominican Republic', 'Haiti', 'Honduras', 'Nicaragua', 'El Salvador', 'Guatemala', 'Costa Rica', 'Panama']

export const SIDES = [
  // ---- Axis --------------------------------------------------------------------------------------
  [['Germany (Prussia)'], 'axis', '1939-01-01', ALL_TIME, 'Germany'],
  [['Italy/Sardinia'], 'axis', '1939-05-22', '1943-09-08', 'Italy (Pact of Steel); Italy surrendered on 8 Sep 1943'],
  [['Libya'], 'axis', '1939-05-22', '1943-05-13', 'Italian Libya until the Axis surrender in Africa'],
  [['Eritrea', 'Italian Somaliland'], 'axis', '1939-05-22', '1941-05-01', 'Italian East Africa until the British conquest in spring 1941'],
  [JAPANESE_EMPIRE, 'axis', '1940-09-27', ALL_TIME, 'Japan and its colonies (Tripartite Pact)'],
  [['Hungary'], 'axis', '1940-11-20', ALL_TIME, 'Hungary joined the Tripartite Pact'],
  [['Rumania'], 'axis', '1940-11-23', '1944-08-23', 'Romania: Tripartite Pact; changed sides on 23 Aug 1944'],
  [['Bulgaria'], 'axis', '1941-03-01', '1944-09-09', 'Bulgaria: Tripartite Pact; changed sides on 9 Sep 1944'],
  [['Finland'], 'axis', '1941-06-25', '1944-09-19', 'Finland: co-belligerent with Germany until the armistice of 19 Sep 1944'],
  [['Thailand'], 'axis', '1941-12-21', ALL_TIME, 'Thailand: alliance with Japan'],
  // ---- Allies ------------------------------------------------------------------------------------
  [['Poland'], 'allied', '1939-09-01', ALL_TIME, 'Poland (government in exile after 1939)'],
  [['United Kingdom', ...BRITISH_EMPIRE, 'Australia', 'New Zealand'], 'allied', '1939-09-03', ALL_TIME, 'United Kingdom, its colonies and dominions'],
  [BRITISH_SOUTHEAST_ASIA, 'allied', '1939-09-03', '1942-01-15', 'British Malaya and Borneo until the Japanese conquest'],
  [['Myanmar (Burma)'], 'allied', '1939-09-03', '1942-03-08', 'British Burma until the fall of Rangoon'],
  [['South Africa'], 'allied', '1939-09-06', ALL_TIME, 'South Africa'],
  [['Canada'], 'allied', '1939-09-10', ALL_TIME, 'Canada'],
  [['France', ...FRENCH_EQUATORIAL, ...FRENCH_WEST_AFRICA, ...FRENCH_CARIBBEAN, ...INDOCHINA, 'Madagascar (Malagasy)', 'Reunion', 'Syria', 'Lebanon', 'Tunisia'], 'allied', '1939-09-03', '1940-06-22', 'France and its empire until the armistice'],
  [FRENCH_EQUATORIAL, 'allied', '1940-08-28', ALL_TIME, 'French Equatorial Africa and the Pacific territories joined Free France'],
  [['France'], 'allied', '1942-11-11', ALL_TIME, 'France after the end of the Vichy zone; occupied parts are shown as occupation'],
  [['Morocco', 'Algeria'], 'allied', '1942-11-11', ALL_TIME, 'French North Africa joined the Allies after Operation Torch'],
  [['Tunisia'], 'allied', '1943-05-13', ALL_TIME, 'Tunisia after the Axis surrender in Africa'],
  [['Senegal', 'Mali', 'Guinea', "Cote D'Ivoire", 'Benin', 'Niger', 'Mauritania', 'Togo'], 'allied', '1942-11-23', ALL_TIME, 'French West Africa joined the Allies'],
  [['Djibouti'], 'allied', '1942-12-28', ALL_TIME, 'French Somaliland joined Free France'],
  [FRENCH_CARIBBEAN, 'allied', '1943-07-14', ALL_TIME, 'French Antilles and Guiana joined Free France'],
  [['Madagascar (Malagasy)', 'Reunion'], 'allied', '1942-11-30', ALL_TIME, 'Madagascar and Réunion under Free France'],
  [['Belgium', 'Netherlands', 'Luxembourg', 'Congo, Democratic Republic of (Zaire)', 'Rwanda-Urundi', 'Surinam'], 'allied', '1940-05-10', ALL_TIME, 'Low Countries and their colonies (German invasion)'],
  [['Indonesia'], 'allied', '1940-05-10', '1942-03-09', 'Dutch East Indies until the Japanese conquest'],
  [['Norway'], 'allied', '1940-04-09', ALL_TIME, 'Norway (German invasion)'],
  [['Greece'], 'allied', '1940-10-28', ALL_TIME, 'Greece (Italian invasion)'],
  [['Yugoslavia'], 'allied', '1941-04-06', ALL_TIME, 'Yugoslavia (Axis invasion)'],
  [['Russia (Soviet Union)'], 'allied', '1941-06-22', ALL_TIME, 'Soviet Union (German invasion)'],
  [['Czechoslovakia'], 'allied', '1941-12-16', ALL_TIME, 'Czechoslovakia (government in exile declared war)'],
  [['United States of America', 'Alaska', 'Hawaii', 'Puerto Rico'], 'allied', '1941-12-08', ALL_TIME, 'United States'],
  [['Philippines'], 'allied', '1941-12-08', '1942-05-06', 'Philippines until the fall of Corregidor'],
  [['China'], 'allied', '1941-12-09', ALL_TIME, 'China declared war on Japan, Germany and Italy (Japanese-occupied areas are not drawn)'],
  [DECEMBER_1941_AMERICAS, 'allied', '1941-12-12', ALL_TIME, 'Central American and Caribbean states declared war in December 1941'],
  [['Mexico'], 'allied', '1942-05-22', ALL_TIME, 'Mexico'],
  [['Brazil'], 'allied', '1942-08-22', ALL_TIME, 'Brazil'],
  [['Ethiopia'], 'allied', '1942-12-01', ALL_TIME, 'Ethiopia'],
  [['Iraq'], 'allied', '1943-01-16', ALL_TIME, 'Iraq'],
  [['Bolivia'], 'allied', '1943-04-07', ALL_TIME, 'Bolivia'],
  [['Iran (Persia)'], 'allied', '1943-09-09', ALL_TIME, 'Iran'],
  [['Italy/Sardinia'], 'allied', '1943-10-13', ALL_TIME, 'Kingdom of Italy declared war on Germany; occupied parts are shown as occupation'],
  [['Colombia'], 'allied', '1943-11-26', ALL_TIME, 'Colombia'],
  [['Liberia'], 'allied', '1944-01-27', ALL_TIME, 'Liberia'],
  [['Rumania'], 'allied', '1944-08-23', ALL_TIME, 'Romania after changing sides'],
  [['Bulgaria'], 'allied', '1944-09-09', ALL_TIME, 'Bulgaria after changing sides'],
  [['Ecuador'], 'allied', '1945-02-02', ALL_TIME, 'Ecuador'],
  [['Paraguay'], 'allied', '1945-02-07', ALL_TIME, 'Paraguay'],
  [['Peru', 'Chile'], 'allied', '1945-02-12', ALL_TIME, 'Peru and Chile'],
  [['Venezuela'], 'allied', '1945-02-15', ALL_TIME, 'Venezuela'],
  [['Uruguay'], 'allied', '1945-02-22', ALL_TIME, 'Uruguay'],
  [['Turkey (Ottoman Empire)'], 'allied', '1945-02-23', ALL_TIME, 'Turkey'],
  [['Egypt'], 'allied', '1945-02-24', ALL_TIME, 'Egypt'],
  [['Syria', 'Lebanon'], 'allied', '1945-02-26', ALL_TIME, 'Syria and Lebanon'],
  [['Saudi Arabia'], 'allied', '1945-03-01', ALL_TIME, 'Saudi Arabia'],
  [['Argentina'], 'allied', '1945-03-27', ALL_TIME, 'Argentina'],
  // ---- whole units held by the other side ------------------------------------------------------
  [['Eritrea', 'Italian Somaliland'], 'alliedControl', '1941-05-01', ALL_TIME, 'British military administration of former Italian East Africa'],
  [['Libya'], 'alliedControl', '1943-05-13', ALL_TIME, 'British and French military administration of Libya'],
  [['Iceland'], 'alliedControl', '1940-05-10', ALL_TIME, 'Iceland occupied by British, from 1941 U.S. forces'],
  [['Egypt'], 'alliedControl', '1939-09-03', '1945-02-24', 'British forces in Egypt (Suez Canal) before Egypt declared war'],
  [['Syria', 'Lebanon'], 'alliedControl', '1941-07-14', '1945-02-26', 'Allied control after the Syria–Lebanon campaign'],
  [['Iran (Persia)'], 'alliedControl', '1941-08-25', '1943-09-09', 'Anglo-Soviet occupation of Iran'],
  [['Madagascar (Malagasy)'], 'alliedControl', '1942-11-05', '1942-11-30', 'British occupation of Madagascar'],
  [INDOCHINA, 'axisOccupied', '1941-07-28', '1945-08-15', 'Japanese military presence in French Indochina'],
  [BRITISH_SOUTHEAST_ASIA, 'axisOccupied', '1942-02-15', '1945-08-15', 'Japanese-occupied Malaya, Singapore and Borneo'],
  [['Indonesia'], 'axisOccupied', '1942-03-09', '1945-08-15', 'Japanese-occupied Dutch East Indies'],
  [['Myanmar (Burma)'], 'axisOccupied', '1942-05-20', '1945-01-01', 'Japanese-occupied Burma'],
  [['Myanmar (Burma)'], 'contested', '1945-01-01', '1945-05-03', 'Allied offensive in Burma (Mandalay 20 Mar, Rangoon 3 May 1945)'],
  [['Philippines'], 'axisOccupied', '1942-05-06', '1944-10-20', 'Japanese-occupied Philippines'],
  [['Philippines'], 'contested', '1944-10-20', '1945-07-05', 'U.S. campaign in the Philippines (Leyte 20 Oct 1944)'],
  [['Tunisia'], 'contested', '1942-11-09', '1943-05-13', 'Tunisian campaign'],
]

/** Role of a CShapes unit on a date, or null (no claim). Later rows override earlier ones. */
export function roleOf(name, date) {
  let role = null
  for (const [names, r, from, to] of SIDES) if (names.includes(name) && from <= date && date < to) role = r
  return role
}

const DE = {
  'Germany (Prussia)': 'Deutsches Reich', 'Italy/Sardinia': 'Italien', Japan: 'Japan', Korea: 'Korea (japanische Kolonie)', Taiwan: 'Taiwan (japanische Kolonie)',
  Hungary: 'Ungarn', Rumania: 'Rumänien', Bulgaria: 'Bulgarien', Finland: 'Finnland', Thailand: 'Thailand', Poland: 'Polen', 'United Kingdom': 'Vereinigtes Königreich',
  France: 'Frankreich', 'Russia (Soviet Union)': 'Sowjetunion', 'United States of America': 'Vereinigte Staaten', China: 'China', Canada: 'Kanada', Australia: 'Australien',
  'New Zealand': 'Neuseeland', 'South Africa': 'Südafrika', India: 'Britisch-Indien', Belgium: 'Belgien', Netherlands: 'Niederlande', Luxembourg: 'Luxemburg', Norway: 'Norwegen',
  Greece: 'Griechenland', Yugoslavia: 'Jugoslawien', Czechoslovakia: 'Tschechoslowakei', Brazil: 'Brasilien', Mexico: 'Mexiko', Egypt: 'Ägypten', Iran: 'Iran',
  'Iran (Persia)': 'Iran', Iraq: 'Irak', Turkey: 'Türkei', 'Turkey (Ottoman Empire)': 'Türkei', Iceland: 'Island', Libya: 'Libyen', Ethiopia: 'Äthiopien',
  Indonesia: 'Niederländisch-Indien', Philippines: 'Philippinen', 'Myanmar (Burma)': 'Burma', 'Congo, Democratic Republic of (Zaire)': 'Belgisch-Kongo', Algeria: 'Algerien',
  Morocco: 'Marokko', Tunisia: 'Tunesien', Syria: 'Syrien', Lebanon: 'Libanon', 'Vietnam (Annam/Cochin China/Tonkin)': 'Französisch-Indochina (Vietnam)',
}
export const unitTitle = (name) => ({ de: DE[name] ?? name, en: name.replace(' (Prussia)', '').replace('Italy/Sardinia', 'Italy').replace('Russia (Soviet Union)', 'Soviet Union') })
export const reasonOf = (name, date) => SIDES.filter(([names, , from, to]) => names.includes(name) && from <= date && date < to).at(-1)?.[4]
