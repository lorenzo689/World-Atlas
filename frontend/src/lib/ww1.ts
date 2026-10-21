export interface Ww1Event {
  id: string
  date: string
  title: { de: string; en: string }
  summary: { de: string; en: string }
  location: { lat: number; lng: number }
  source: { title: string; url: string }
}

export interface Ww1Moment {
  year: number
  date: string
  title: { de: string; en: string }
  overview: { de: string; en: string }
  events: Ww1Event[]
}

const nationalArchives = 'https://www.archives.gov/topics/wwi'
const moments: Ww1Moment[] = [
  {
    year: 1914, date: '1914-06-28',
    title: { de: 'Der Krieg beginnt in Europa', en: 'War begins in Europe' },
    overview: { de: 'Das Attentat von Sarajevo löste eine diplomatische Krise aus. Bündnisse, Mobilmachungen und Entscheidungen der Regierungen weiteten den Konflikt im Sommer 1914 aus.', en: 'The assassination in Sarajevo triggered a diplomatic crisis. Alliances, mobilisations and decisions by governments widened the conflict during the summer of 1914.' },
    events: [
      { id: 'sarajevo', date: '1914-06-28', title: { de: 'Attentat von Sarajevo', en: 'Assassination in Sarajevo' }, summary: { de: 'Erzherzog Franz Ferdinand und Sophie wurden in Sarajevo ermordet. Das Ereignis war Auslöser der Julikrise, nicht alleinige Ursache des Krieges.', en: 'Archduke Franz Ferdinand and Sophie were assassinated in Sarajevo. The event triggered the July Crisis; it was not the sole cause of the war.' }, location: { lat: 43.8563, lng: 18.4131 }, source: { title: 'U.S. National Archives · World War I', url: nationalArchives } },
      { id: 'tannenberg', date: '1914-08-26', title: { de: 'Schlacht bei Tannenberg', en: 'Battle of Tannenberg' }, summary: { de: 'Eine große Schlacht an der Ostfront zwischen deutschen und russischen Truppen.', en: 'A major Eastern Front battle between German and Russian forces.' }, location: { lat: 53.49, lng: 20.12 }, source: { title: 'U.S. National Archives · World War I', url: nationalArchives } },
    ],
  },
  {
    year: 1915, date: '1915-04-25',
    title: { de: 'Neue Kriegsschauplätze', en: 'New theaters of war' },
    overview: { de: 'Der Krieg weitete sich über Europa hinaus aus. Die Dardanellenkampagne verband Land- und Seekrieg und endete für die alliierten Truppen mit dem Rückzug Anfang 1916.', en: 'The war extended beyond Europe. The Dardanelles campaign combined land and naval warfare and ended with the Allied withdrawal in early 1916.' },
    events: [
      { id: 'gallipoli', date: '1915-04-25', title: { de: 'Landungen auf Gallipoli', en: 'Landings at Gallipoli' }, summary: { de: 'Britische und französische Truppen landeten auf der Halbinsel Gallipoli. Die Kampagne dauerte bis Januar 1916.', en: 'British and French forces landed on the Gallipoli peninsula. The campaign continued until January 1916.' }, location: { lat: 40.25, lng: 26.28 }, source: { title: 'Imperial War Museums · Gallipoli campaign', url: 'https://www.iwm.org.uk/collections/item/object/205325969' } },
      { id: 'lusitania', date: '1915-05-07', title: { de: 'Versenkung der Lusitania', en: 'Sinking of the Lusitania' }, summary: { de: 'Ein deutsches U-Boot versenkte das Passagierschiff vor der irischen Küste. Der Angriff prägte die öffentliche Debatte über den Seekrieg.', en: 'A German submarine sank the passenger liner off the Irish coast. The attack shaped public debate about naval warfare.' }, location: { lat: 51.42, lng: -8.55 }, source: { title: 'U.S. National Archives · World War I', url: nationalArchives } },
    ],
  },
  {
    year: 1916, date: '1916-07-01',
    title: { de: 'Abnutzungsschlachten', en: 'Battles of attrition' },
    overview: { de: 'Verdun und die Somme wurden zu monatelangen Abnutzungsschlachten. Die Ereignismarker zeigen Orte, keine Frontverläufe oder kontrollierten Gebiete.', en: 'Verdun and the Somme became months-long battles of attrition. Event markers show locations, not front lines or controlled territory.' },
    events: [
      { id: 'verdun', date: '1916-02-21', title: { de: 'Beginn der Schlacht um Verdun', en: 'Battle of Verdun begins' }, summary: { de: 'Die deutsche Offensive gegen Verdun begann am 21. Februar. Die Kämpfe dauerten bis Dezember 1916.', en: 'The German offensive against Verdun began on 21 February. Fighting continued until December 1916.' }, location: { lat: 49.16, lng: 5.38 }, source: { title: 'U.S. National Archives · World War I', url: nationalArchives } },
      { id: 'somme', date: '1916-07-01', title: { de: 'Beginn der Somme-Offensive', en: 'Somme offensive begins' }, summary: { de: 'Die britisch-französische Offensive an der Somme begann am 1. Juli und wurde bis November fortgeführt.', en: 'The British and French offensive on the Somme began on 1 July and continued into November.' }, location: { lat: 50.02, lng: 2.7 }, source: { title: 'Imperial War Museums · First World War guide', url: 'https://www.iwm.org.uk/sites/default/files/files/2023-10/first_world_war_large_print_guide.pdf' } },
    ],
  },
  {
    year: 1917, date: '1917-04-06',
    title: { de: 'Der Krieg wird globaler', en: 'The war becomes more global' },
    overview: { de: 'Die Vereinigten Staaten erklärten Deutschland am 6. April den Krieg. In Russland führten Revolutionen zum Ende der Zarenherrschaft und veränderten die Lage an der Ostfront.', en: 'The United States declared war on Germany on 6 April. Revolutions in Russia ended tsarist rule and changed the situation on the Eastern Front.' },
    events: [
      { id: 'us-entry', date: '1917-04-06', title: { de: 'Kriegserklärung der USA', en: 'United States enters the war' }, summary: { de: 'Der US-Kongress beschloss die Kriegserklärung an Deutschland. Die USA waren zuvor neutral.', en: 'The U.S. Congress declared war on Germany. The United States had been neutral before this decision.' }, location: { lat: 38.8977, lng: -77.0365 }, source: { title: 'U.S. National Archives · Declaration of War', url: 'https://www.archives.gov/milestone-documents/address-to-congress-declaration-of-war-against-germany' } },
      { id: 'zimmermann', date: '1917-03-01', title: { de: 'Zimmermann-Telegramm wird bekannt', en: 'Zimmermann Telegram becomes public' }, summary: { de: 'Die Veröffentlichung des abgefangenen Telegramms verschärfte die Debatte über einen Kriegseintritt der USA.', en: 'Publication of the intercepted telegram intensified debate about U.S. entry into the war.' }, location: { lat: 38.8977, lng: -77.0365 }, source: { title: 'U.S. National Archives · Zimmermann Telegram', url: 'https://www.archives.gov/milestone-documents/zimmermann-telegram' } },
    ],
  },
  {
    year: 1918, date: '1918-11-11',
    title: { de: 'Waffenstillstand', en: 'Armistice' },
    overview: { de: 'Nach den deutschen Frühjahrsoffensiven und den alliierten Gegenoffensiven wurde am 11. November 1918 der Waffenstillstand unterzeichnet. Er beendete die Kämpfe an der Westfront.', en: 'After the German spring offensives and Allied counteroffensives, the armistice was signed on 11 November 1918. It ended fighting on the Western Front.' },
    events: [
      { id: 'armistice', date: '1918-11-11', title: { de: 'Waffenstillstand von Compiègne', en: 'Armistice of Compiègne' }, summary: { de: 'Der Waffenstillstand trat am 11. November um 11 Uhr in Kraft. Er beendete die Kampfhandlungen, nicht unmittelbar alle politischen Folgen des Krieges.', en: 'The armistice took effect at 11 a.m. on 11 November. It ended hostilities, not the political consequences of the war.' }, location: { lat: 49.42, lng: 2.83 }, source: { title: 'U.S. National Archives · World War I', url: nationalArchives } },
    ],
  },
]

export const WW1_MOMENTS = moments
export const ww1Moment = (year: number | null | undefined) => moments.find((moment) => moment.year === year) ?? null
