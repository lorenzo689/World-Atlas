type Localized = { de: string; en: string }

export interface ConflictBrief {
  id: string
  countryCodes: string[]
  title: Localized
  region: Localized
  status: 'active' | 'fragile-ceasefire'
  location: { lat: number; lng: number }
  sourceDate: string
  sourceName: string
  sourceUrl: string
  summary: Localized
  context: Localized
  question: Localized
  answer: Localized
}

/** Curated regional reading points, not battle locations or territorial-control claims. */
export const CONFLICT_BRIEFS: ConflictBrief[] = [
  { id: 'ukraine', countryCodes: ['UKR'], title: { de: 'Krieg in der Ukraine', en: 'War in Ukraine' }, region: { de: 'Ukraine', en: 'Ukraine' }, status: 'active', location: { lat: 49, lng: 32 }, sourceDate: '2026-10-16', sourceName: 'UN Human Rights Monitoring Mission in Ukraine', sourceUrl: 'https://ukraine.un.org/en/324561-protection-civilians-armed-conflict-%E2%80%94-september-2026', summary: { de: 'Die UN dokumentiert weiterhin zivile Opfer durch den Krieg und Angriffe auf Infrastruktur.', en: 'The UN continues to document civilian harm from the war and attacks on infrastructure.' }, context: { de: 'Die Markierung steht für die gesamte betroffene Region. Sie zeigt weder die Frontlinie noch die Kontrolle einzelner Gebiete.', en: 'The marker represents the broader affected region. It shows neither a frontline nor control of individual areas.' }, question: { de: 'Warum kann eine Staatsgrenze keine Frontlinie ersetzen?', en: 'Why cannot a national border stand in for a frontline?' }, answer: { de: 'Eine Staatsgrenze bezeichnet eine rechtliche Gebietsgrenze; eine Frontlinie ist eine zeitlich veränderliche militärische Lage.', en: 'A national border is a legal boundary; a frontline is a changing military situation.' } },
  { id: 'sudan', countryCodes: ['SDN'], title: { de: 'Konflikt im Sudan', en: 'Conflict in Sudan' }, region: { de: 'Sudan', en: 'Sudan' }, status: 'active', location: { lat: 15.5, lng: 30 }, sourceDate: '2026-10-10', sourceName: 'UN Resident and Humanitarian Coordinator in Sudan', sourceUrl: 'https://sudan.un.org/en/324199-statement-united-nations-resident-and-humanitarian-coordinator-sudan-denise-brown', summary: { de: 'Die UN berichtet über Angriffe und Gefahren für vertriebene Zivilpersonen.', en: 'The UN reports attacks and threats to displaced civilians.' }, context: { de: 'Die Quelle beschreibt einen Vorfall in Blue Nile. Der Kartenpunkt ist ein regionaler Einstieg, keine genaue Ereigniskoordinate.', en: 'The source describes an incident in Blue Nile. The map point is a regional entry point, not an exact incident coordinate.' }, question: { de: 'Was bedeutet Vertreibung in diesem Kontext?', en: 'What does displacement mean in this context?' }, answer: { de: 'Menschen müssen ihren Wohnort wegen Gewalt oder Gefahr verlassen; sie können innerhalb des Landes bleiben oder eine Grenze überqueren.', en: 'People must leave home because of violence or danger; they may remain within the country or cross a border.' } },
  { id: 'myanmar', countryCodes: ['MMR'], title: { de: 'Konflikt in Myanmar', en: 'Conflict in Myanmar' }, region: { de: 'Myanmar', en: 'Myanmar' }, status: 'active', location: { lat: 20, lng: 96 }, sourceDate: '2026-09-24', sourceName: 'UN Secretary-General', sourceUrl: 'https://myanmar.un.org/en/321531-statement-attributable-spokesperson-secretary-general-nine-years-forced-mass-displacement', summary: { de: 'Die UN beschreibt anhaltenden Konflikt, Vertreibung und Menschenrechtsverletzungen.', en: 'The UN describes continuing conflict, displacement and human rights abuses.' }, context: { de: 'Die Lage betrifft mehrere Landesteile und Bevölkerungsgruppen. Der Marker ist bewusst nur regional.', en: 'The situation affects several parts of the country and communities. The marker is deliberately regional.' }, question: { de: 'Warum reicht ein einzelner Punkt für diese Lage nicht aus?', en: 'Why is one point insufficient to describe this situation?' }, answer: { de: 'Die Auswirkungen erstrecken sich über viele Orte und verändern sich mit der Zeit.', en: 'The impacts span many places and change over time.' } },
  { id: 'drc', countryCodes: ['COD'], title: { de: 'Konflikt im Osten der DR Kongo', en: 'Conflict in eastern DR Congo' }, region: { de: 'Ost-Kongo', en: 'Eastern DR Congo' }, status: 'active', location: { lat: -1.5, lng: 28.7 }, sourceDate: '2026-10-16', sourceName: 'UN Department of Political and Peacebuilding Affairs', sourceUrl: 'https://dppa.un.org/en/news/this-week-in-dppa-10-16-october-2026', summary: { de: 'Die UN berichtet über diplomatische Bemühungen zur Beilegung des Konflikts im Osten des Landes.', en: 'The UN reports diplomatic efforts to resolve the conflict in the east of the country.' }, context: { de: 'Der Punkt liegt in der Großregion der Kivu-Provinzen und zeigt keine kontrollierten Gebiete.', en: 'The point lies in the wider Kivu region and does not depict areas of control.' }, question: { de: 'Warum gehören Friedensgespräche zu einer Konfliktkarte?', en: 'Why do peace talks belong on a conflict map?' }, answer: { de: 'Sie zeigen politische Wege zur Beendigung der Gewalt; eine Konfliktlage besteht nicht nur aus Kämpfen.', en: 'They show political ways to end violence; a conflict is more than fighting.' } },
  { id: 'gaza', countryCodes: ['PSE', 'ISR'], title: { de: 'Gaza: fragile Waffenruhe', en: 'Gaza: fragile ceasefire' }, region: { de: 'Gazastreifen', en: 'Gaza Strip' }, status: 'fragile-ceasefire', location: { lat: 31.4, lng: 34.35 }, sourceDate: '2026-09-18', sourceName: 'UN OCHA occupied Palestinian territory', sourceUrl: 'https://www.ochaopt.org/content/humanitarian-situation-report-18-september-2026', summary: { de: 'Nach der Waffenruhe von Oktober 2025 bestehen laut OCHA weiterhin Angriffe und große humanitäre Bedürfnisse.', en: 'After the October 2025 ceasefire, OCHA reports continuing strikes and major humanitarian needs.' }, context: { de: 'Der Status ist ausdrücklich eine fragile Waffenruhe. Der Marker beschreibt keine aktuelle Front oder Territorialkontrolle.', en: 'The status is explicitly a fragile ceasefire. The marker depicts no current frontline or territorial control.' }, question: { de: 'Ist eine Waffenruhe gleichbedeutend mit einer gelösten humanitären Krise?', en: 'Does a ceasefire mean the humanitarian crisis is resolved?' }, answer: { de: 'Nein. Schutz, Versorgung und Wiederaufbau bleiben auch nach einem Rückgang großflächiger Kampfhandlungen nötig.', en: 'No. Protection, aid and recovery remain necessary even after large-scale hostilities decrease.' } },
]

export function sourceAgeDays(sourceDate: string, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(`${sourceDate}T00:00:00Z`).getTime()) / 86_400_000))
}

export function validateConflictBriefs(briefs: ConflictBrief[], now = new Date()): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const brief of briefs) {
    if (ids.has(brief.id)) errors.push(`Duplicate id: ${brief.id}`)
    ids.add(brief.id)
    if (!Number.isFinite(Date.parse(`${brief.sourceDate}T00:00:00Z`)) || new Date(`${brief.sourceDate}T00:00:00Z`) > now) errors.push(`Invalid source date: ${brief.id}`)
    if (!brief.sourceUrl.startsWith('https://')) errors.push(`Invalid source URL: ${brief.id}`)
    if (Math.abs(brief.location.lat) > 90 || Math.abs(brief.location.lng) > 180) errors.push(`Invalid coordinates: ${brief.id}`)
    if (sourceAgeDays(brief.sourceDate, now) > 90) errors.push(`Review outdated source: ${brief.id}`)
  }
  return errors
}
