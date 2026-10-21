import { ArrowLeft, ArrowRight, Clock3, Globe2, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from '@/components/layout/Brand'
import { UserMenu } from '@/components/layout/UserMenu'
import { useDocumentMeta } from '@/hooks/useMisc'
import { useLang } from '@/i18n'
import { useAuth } from '@/store/auth'

const scenarios = [
  {
    id: 'today', href: '/explore?scenario=today', era: '2026',
    title: { de: 'Die Welt heute', en: 'The world today' },
    text: { de: 'Erkunde Länder, Hauptstädte, aktuelle Daten und verifizierte Lerninhalte auf dem modernen Globus.', en: 'Explore countries, capitals, current data and reviewed learning content on the modern globe.' },
    label: { de: 'Gegenwart', en: 'Present day' }, accent: 'from-sky-400/35 via-blue-900/30 to-slate-950',
  },
  {
    id: 'ww2', href: '/explore?scenario=ww2&year=1939', era: '1939—1945',
    title: { de: 'Zweiter Weltkrieg', en: 'World War II' },
    text: { de: 'Verfolge datierte Grenzveränderungen, Quellenereignisse und ausgewählte Kriegsschauplätze.', en: 'Follow dated border changes, sourced events and selected theaters of war.' },
    label: { de: 'Szenario', en: 'Scenario' }, accent: 'from-orange-500/35 via-rose-950/50 to-slate-950',
  },
  {
    id: 'ww1', href: '/explore?scenario=ww1&year=1914', era: '1914—1918',
    title: { de: 'Erster Weltkrieg', en: 'World War I' },
    text: { de: 'Ordne zentrale Wendepunkte des Krieges auf einer zeitgenössischen historischen Grenzkarte ein.', en: 'Place key turning points of the war on a historical boundary map.' },
    label: { de: 'Szenario', en: 'Scenario' }, accent: 'from-amber-400/30 via-stone-900/55 to-slate-950',
  },
  {
    id: 'borders', href: '/explore?scenario=borders&year=1886&compare=1914', era: '1886—2019',
    title: { de: 'Grenzen im Wandel', en: 'Changing borders' },
    text: { de: 'Vergleiche beliebige Jahre und untersuche territoriale Veränderungen mit Quellen und Lernpfaden.', en: 'Compare years and investigate territorial change through sources and guided lessons.' },
    label: { de: 'Zeitreise', en: 'Time travel' }, accent: 'from-emerald-400/25 via-teal-950/50 to-slate-950',
  },
]

export default function ScenarioPage() {
  const lang = useLang((state) => state.lang)
  const user = useAuth((state) => state.user)
  const de = lang === 'de'
  useDocumentMeta({ title: de ? 'Szenarien · World Explorer' : 'Scenarios · World Explorer', description: de ? 'Wähle eine Epoche und erkunde die Weltkarte interaktiv.' : 'Choose an era and explore the interactive world map.' })
  return <div className="min-h-full bg-[#080e17] text-[#edf3fb]">
    <header className="sticky top-0 z-30 border-b border-white/[.07] bg-[#080e17]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center px-5 sm:px-8"><Brand/><nav className="ml-auto flex items-center gap-3"><Link to="/" className="hidden items-center gap-1.5 text-sm text-slate-400 hover:text-white sm:flex"><ArrowLeft className="size-4"/>{de ? 'Startseite' : 'Home'}</Link><UserMenu/></nav></div>
    </header>
    <main className="mx-auto max-w-7xl px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
      <div className="max-w-3xl"><p className="eyebrow text-blue-200">{de ? 'Dein interaktiver Atlas' : 'Your interactive atlas'}</p><h1 className="mt-3 font-serif text-5xl leading-[.98] tracking-tight sm:text-7xl">{de ? 'Welche Welt möchtest du erkunden?' : 'Which world do you want to explore?'}</h1><p className="mt-5 max-w-2xl text-base leading-7 text-slate-400">{de ? 'Jedes Szenario öffnet dieselbe interaktive Karte mit eigenen historischen Ebenen, Ereignissen und Quellen.' : 'Every scenario opens the same interactive map with its own historical layers, events and sources.'}</p></div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {scenarios.map((scenario, index) => <Link key={scenario.id} to={scenario.href} className={`group relative isolate flex min-h-[340px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br ${scenario.accent} p-6 transition duration-300 hover:-translate-y-1 hover:border-white/25 hover:shadow-[0_25px_80px_rgba(0,0,0,.38)]`}>
          <div className="absolute inset-0 -z-10 opacity-20" style={{ backgroundImage: `url('${import.meta.env.BASE_URL}textures/earth-blue-marble-2k.webp')`, backgroundPosition: `${38 + index * 14}% center`, backgroundSize: 'cover', mixBlendMode: 'screen' }} />
          <div className="absolute -right-20 -top-20 -z-10 size-64 rounded-full border border-white/10"/><div className="absolute -right-12 -top-12 -z-10 size-48 rounded-full border border-white/[.08]"/>
          <div className="flex items-center justify-between"><span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[.16em] text-white/75">{scenario.label[lang]}</span><Globe2 className="size-4 text-white/50"/></div>
          <div className="mt-auto"><p className="tabular text-sm tracking-[.12em] text-white/65">{scenario.era}</p><h2 className="mt-2 font-serif text-3xl leading-tight">{scenario.title[lang]}</h2><p className="mt-3 min-h-[72px] text-sm leading-6 text-white/70">{scenario.text[lang]}</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-white">{de ? 'Szenario öffnen' : 'Open scenario'}<ArrowRight className="size-4 transition-transform group-hover:translate-x-1"/></span></div>
        </Link>)}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[.08] bg-white/[.025] px-5 py-4">
        <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-blue-300/10 text-blue-200"><Clock3 className="size-4"/></span><p className="text-sm text-slate-300">{de ? 'Jedes historische Szenario zeigt den Stichtag und die Herkunft seiner Kartendaten.' : 'Each historical scenario states its snapshot date and map data sources.'}</p></div>
        {!user && import.meta.env.VITE_STATIC_DEMO !== 'true' && <Link to="/login?tab=register" className="inline-flex items-center gap-2 text-sm text-blue-200 hover:text-white"><ShieldCheck className="size-4"/>{de ? 'Konto für Lernfortschritt erstellen' : 'Create an account to save progress'}<ArrowRight className="size-4"/></Link>}
      </div>
    </main>
  </div>
}
