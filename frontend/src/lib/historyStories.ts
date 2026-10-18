import { HISTORY_EVENTS } from './historyCompare'

type Localized = { de: string; en: string }
export interface HistoryStory {
  id: string
  focus: { lat: number; lng: number; altitude: number }
  steps: Localized[]
  question: Localized
  answer: Localized
}

/** Editorial explanations are tied to dated snapshots and the event's primary source. */
export const HISTORY_STORIES: HistoryStory[] = [
  { id: 'german-unity', focus: { lat: 51, lng: 11, altitude: 1.25 }, steps: [
    { de: 'Vorher: Zwei deutsche Staaten und eine innerdeutsche Grenze.', en: 'Before: Two German states and an inner-German border.' },
    { de: 'Am 3. Oktober 1990 trat die DDR der Bundesrepublik bei.', en: 'On 3 October 1990, East Germany joined the Federal Republic.' },
    { de: 'Nachher: Die Staatsgrenze zwischen Ost und West entfiel. Vergleiche die farbigen Linien.', en: 'After: The border between East and West disappeared. Compare the colored lines.' },
  ], question: { de: 'Welche Grenze verschwand?', en: 'Which border disappeared?' }, answer: { de: 'Die innerdeutsche Staatsgrenze. Die äußeren Grenzen Deutschlands sind davon zu unterscheiden.', en: 'The border between the two German states. Distinguish it from Germany’s external borders.' } },
  { id: 'soviet-union', focus: { lat: 54, lng: 44, altitude: 2.6 }, steps: [
    { de: 'Vorher: Die Sowjetunion bestand aus Unionsrepubliken.', en: 'Before: The Soviet Union consisted of union republics.' },
    { de: '1991 wurden die Republiken unabhängige Staaten; Russland setzte die UN-Mitgliedschaft der Sowjetunion fort.', en: 'In 1991 the republics became independent states; Russia continued the Soviet Union’s UN membership.' },
    { de: 'Nachher: Viele neue internationale Grenzen erscheinen. Zoome hinein und vergleiche Regionen.', en: 'After: Many new international borders appear. Zoom in and compare regions.' },
  ], question: { de: 'Warum erscheinen viele neue Grenzen, obwohl Landflächen bestehen bleiben?', en: 'Why do new borders appear although land areas remain?' }, answer: { de: 'Frühere interne Grenzen wurden zu Grenzen zwischen souveränen Staaten.', en: 'Former internal boundaries became borders between sovereign states.' } },
  { id: 'czechoslovakia', focus: { lat: 49, lng: 17, altitude: 1.1 }, steps: [
    { de: 'Vorher: Tschechien und die Slowakei gehörten zur Tschechoslowakei.', en: 'Before: Czechia and Slovakia were part of Czechoslovakia.' },
    { de: 'Am 1. Januar 1993 entstanden zwei unabhängige Staaten.', en: 'Two independent states emerged on 1 January 1993.' },
    { de: 'Nachher: Zwischen beiden verläuft eine internationale Grenze.', en: 'After: An international border separates them.' },
  ], question: { de: 'Entstand eine neue Landfläche?', en: 'Was new land created?' }, answer: { de: 'Nein. Die politische Zuordnung und der Status der Grenze änderten sich.', en: 'No. Political affiliation and the boundary’s status changed.' } },
  { id: 'south-sudan', focus: { lat: 8, lng: 31, altitude: 1.1 }, steps: [
    { de: 'Vorher: Das Gebiet des heutigen Südsudan gehörte zum Sudan.', en: 'Before: The territory of today’s South Sudan belonged to Sudan.' },
    { de: 'Am 9. Juli 2011 wurde Südsudan unabhängig.', en: 'South Sudan became independent on 9 July 2011.' },
    { de: 'Nachher: Die Grenze zwischen Sudan und Südsudan wurde zur Staatsgrenze.', en: 'After: The boundary between Sudan and South Sudan became an international border.' },
  ], question: { de: 'Was zeigt die neue Linie?', en: 'What does the new line show?' }, answer: { de: 'Eine neue Staatsgrenze, keine Veränderung der Erdoberfläche.', en: 'A new international border, not a change to the land surface.' } },
]

export const storyForEvent = (id: string) => HISTORY_STORIES.find((story) => story.id === id)
export const storyEvent = (id: string) => HISTORY_EVENTS.find((event) => event.id === id)
