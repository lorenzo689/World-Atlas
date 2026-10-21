import { ArrowDownRight, ArrowRight, BookOpen, Clock3, Layers3, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useDocumentMeta } from '@/hooks/useMisc'
import { useLang } from '@/i18n'
import { useAuth } from '@/store/auth'

const base = import.meta.env.BASE_URL

export default function LandingPage() {
  const lang = useLang((state) => state.lang)
  const setLang = useLang((state) => state.setLang)
  const user = useAuth((state) => state.user)
  const staticDemo = import.meta.env.VITE_STATIC_DEMO === 'true'
  const de = lang === 'de'
  useDocumentMeta({
    title: de ? 'World Explorer · Eine Karte, viele Zeitalter' : 'World Explorer · One map, many eras',
    description: de ? 'Erkunde die Welt von heute, verfolge Grenzen durch die Geschichte und lerne anhand interaktiver Szenarien.' : 'Explore today’s world, follow borders through history and learn with interactive map scenarios.',
  })

  return <div className="min-h-full overflow-hidden bg-[#080e17] text-[#edf3fb]">
    <header className="relative z-10 mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
      <Link to="/" className="flex items-center gap-3" aria-label="World Explorer home">
        <span className="flex size-9 items-center justify-center rounded-full border border-blue-300/40 text-blue-300"><svg viewBox="0 0 32 32" className="size-6" aria-hidden><circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="1.4"/><ellipse cx="16" cy="16" rx="5" ry="12" fill="none" stroke="currentColor"/><path d="M4 16h24M6 10h20M6 22h20" stroke="currentColor" opacity=".7"/></svg></span>
        <span className="font-serif text-2xl tracking-tight">World Explorer</span>
      </Link>
      <nav className="flex items-center gap-2 sm:gap-4">
        <Link to="/explore?scenario=today" className="hidden rounded-full px-3 py-2 text-sm text-white/65 hover:text-white sm:block">{de ? 'Atlas entdecken' : 'Explore the atlas'}</Link>
        <div role="group" aria-label={de ? 'Sprache' : 'Language'} className="flex rounded-full border border-white/10 p-0.5 text-[10px]">
          {(['de', 'en'] as const).map((code) => <button key={code} type="button" lang={code} aria-pressed={lang === code} onClick={() => setLang(code)} className={`rounded-full px-2 py-1 uppercase ${lang === code ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white'}`}>{code}</button>)}
        </div>
        {!staticDemo && (user ? <Link to="/explore?scenario=today" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-blue-100">{de ? 'Weiter erkunden' : 'Continue exploring'}</Link> : <>
          <Link to="/login" className="rounded-full px-3 py-2 text-sm text-white/75 hover:text-white">{de ? 'Anmelden' : 'Sign in'}</Link>
          <Link to="/login?tab=register" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-blue-100">{de ? 'Konto erstellen' : 'Create account'}</Link>
        </>)}
      </nav>
    </header>

    <main>
      <section className="relative mx-auto grid min-h-[660px] max-w-7xl items-center gap-10 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1.04fr_.96fr] lg:pb-28 lg:pt-4">
        <div className="absolute inset-x-0 top-0 -z-10 h-[630px] bg-[radial-gradient(ellipse_at_76%_42%,rgba(42,102,174,.22),transparent_47%),radial-gradient(ellipse_at_12%_12%,rgba(42,81,133,.12),transparent_38%)]" />
        <div className="relative z-10 max-w-2xl">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-300/[.07] px-3 py-1.5 text-[11px] uppercase tracking-[.17em] text-blue-200"><span className="size-1.5 rounded-full bg-emerald-300" />{de ? 'Interaktiver Atlas · Geschichte im Raum' : 'Interactive atlas · History in context'}</p>
          <h1 className="max-w-[680px] font-serif text-[clamp(3.7rem,8vw,7rem)] leading-[.88] tracking-[-.045em]">{de ? <>Die Welt ist<br/><span className="text-blue-300">in Bewegung.</span></> : <>The world is<br/><span className="text-blue-300">always changing.</span></>}</h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">{de ? 'Erkunde Grenzen, Konflikte und Wendepunkte auf einem interaktiven Globus. Springe von der Weltkarte heute mitten hinein in die Geschichte.' : 'Explore borders, conflicts and turning points on an interactive globe. Move from today’s world map into the heart of history.'}</p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link to="/explore?scenario=today" className="group inline-flex h-12 items-center gap-3 rounded-full bg-blue-300 px-6 text-sm font-semibold text-slate-950 transition hover:bg-blue-200">{user ? (de ? 'Weiter erkunden' : 'Continue exploring') : (de ? 'Jetzt entdecken' : 'Explore now')}<ArrowRight className="size-4 transition-transform group-hover:translate-x-1"/></Link>
            {!staticDemo && !user && <Link to="/login?tab=register" className="inline-flex h-12 items-center rounded-full border border-white/15 px-5 text-sm text-white/80 transition hover:border-white/35 hover:text-white">{de ? 'Kostenloses Konto erstellen' : 'Create a free account'}</Link>}
          </div>
          <div className="mt-12 flex flex-wrap gap-x-7 gap-y-3 text-xs text-slate-400">
            <span className="inline-flex items-center gap-2"><Clock3 className="size-4 text-blue-300"/>{de ? 'Von 1886 bis heute' : 'From 1886 to today'}</span>
            <span className="inline-flex items-center gap-2"><Layers3 className="size-4 text-blue-300"/>{de ? 'Grenzen und Ereignisse' : 'Borders and events'}</span>
            <span className="inline-flex items-center gap-2"><BookOpen className="size-4 text-blue-300"/>{de ? 'Lernen durch Erkunden' : 'Learn by exploring'}</span>
          </div>
        </div>

        <div className="relative mx-auto flex aspect-square w-full max-w-[570px] items-center justify-center lg:translate-x-6">
          <div className="absolute inset-[7%] rounded-full bg-blue-500/10 blur-[75px]" />
          <div className="absolute inset-[8%] rounded-full border border-blue-100/10" />
          <div className="absolute inset-[15%] rounded-full border border-blue-100/[.07]" />
          <div className="relative aspect-square w-[78%] overflow-hidden rounded-full border border-blue-100/20 shadow-[0_35px_120px_rgba(16,69,130,.38),inset_-24px_-18px_65px_rgba(0,0,0,.7)]" style={{ backgroundImage: `linear-gradient(90deg,rgba(3,9,18,.04),rgba(3,9,18,.32)),url('${base}textures/earth-blue-marble-2k.webp')`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(ellipse_at_28%_23%,rgba(255,255,255,.18),transparent_34%),radial-gradient(ellipse_at_80%_70%,rgba(0,0,0,.55),transparent_60%)]" />
            <div className="absolute inset-y-0 left-[49%] w-px bg-blue-100/20" />
            <span className="absolute left-[18%] top-[35%] rounded-full border border-white/25 bg-slate-950/55 px-3 py-1.5 text-[10px] tracking-wider text-white/90 backdrop-blur">1914 · Sarajevo</span>
            <span className="absolute bottom-[26%] right-[13%] rounded-full border border-blue-200/30 bg-slate-950/65 px-3 py-1.5 text-[10px] tracking-wider text-blue-100 backdrop-blur">2026 · Today</span>
            <span className="absolute left-[54%] top-[52%] size-2 rounded-full bg-amber-300 shadow-[0_0_18px_6px_rgba(252,211,77,.55)]" />
            <span className="absolute bottom-[36%] left-[30%] size-1.5 rounded-full bg-blue-200 shadow-[0_0_15px_5px_rgba(147,197,253,.55)]" />
          </div>
          <div className="absolute bottom-[9%] left-[4%] hidden max-w-[210px] rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-2xl backdrop-blur-xl sm:block">
            <p className="text-[10px] uppercase tracking-[.17em] text-slate-400">{de ? 'Eine Karte. Viele Perspektiven.' : 'One map. Many perspectives.'}</p>
            <p className="mt-2 font-serif text-xl">1886 — 2026</p>
          </div>
          <ArrowDownRight className="absolute right-[5%] top-[13%] size-5 rotate-[-45deg] text-blue-200/70" />
        </div>
      </section>

      <section className="border-y border-white/[.07] bg-white/[.018]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 md:grid-cols-3 md:gap-10 md:py-14">
          {[
            { icon: Clock3, title: de ? 'Grenzen im Wandel' : 'Borders in motion', body: de ? 'Vergleiche historische Karten und verfolge, wie sich Staaten und Grenzen verändert haben.' : 'Compare historical maps and see how states and borders changed over time.' },
            { icon: BookOpen, title: de ? 'Geschichte verstehen' : 'Understand history', body: de ? 'Quellenbasierte Ereignisse verbinden den Ort mit dem historischen Zusammenhang.' : 'Source-linked events connect places to their historical context.' },
            { icon: ShieldCheck, title: de ? 'Dein Lernatlas' : 'Your learning atlas', body: de ? 'Mit Konto kannst du Fortschritt sichern, Quizze wiederholen und eigene Orte sammeln.' : 'With an account, save progress, review quizzes and collect places in your atlas.' },
          ].map(({ icon: Icon, title, body }) => <article key={title} className="flex gap-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-blue-200/15 bg-blue-200/[.06] text-blue-200"><Icon className="size-5"/></span><div><h2 className="font-serif text-2xl">{title}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">{body}</p></div></article>)}
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-7 text-xs text-slate-500 sm:px-8">
        <span>© 2026 World Explorer</span><div className="flex gap-5"><Link to="/explore?scenario=today" className="hover:text-white">{de ? 'Atlas entdecken' : 'Explore the atlas'}</Link>{!staticDemo && <Link to="/login" className="hover:text-white">{de ? 'Anmelden' : 'Sign in'}</Link>}<Link to="/explore?scenario=today" className="hover:text-white">{de ? 'Karte öffnen' : 'Open the map'}</Link></div>
      </footer>
    </main>
  </div>
}
