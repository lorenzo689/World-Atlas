import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Award, BarChart3, BookMarked, Gamepad2, Languages, LogIn, LogOut, Menu, Scale, ShieldCheck, Swords, Trophy, User as UserIcon } from 'lucide-react'
import { authApi } from '@/lib/api'
import { isAccount, isAdmin, useAuth } from '@/store/auth'
import { LANGS, useLang, useT, type MessageKey } from '@/i18n'
import { cn } from '@/lib/utils'

const LINKS = [
  { to: '/quiz', label: 'nav.quiz', icon: Gamepad2 },
  { to: '/play', label: 'nav.play', icon: Swords },
  { to: '/leaderboard', label: 'nav.leaderboard', icon: Trophy },
  { to: '/data', label: 'nav.data', icon: BarChart3 },
  { to: '/compare', label: 'nav.compare', icon: Scale },
  { to: '/achievements', label: 'nav.achievements', icon: Award, user: true },
  { to: '/atlas', label: 'nav.atlas', icon: BookMarked, account: true },
] as const satisfies readonly { to: string; label: MessageKey; icon: unknown; account?: boolean; user?: boolean }[]

/** Navigation + account menu, shown in the top bar of every page. */
export function UserMenu({ className }: { className?: string }) {
  const t = useT()
  const { lang, setLang } = useLang()
  const user = useAuth((s) => s.user)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="glass flex h-10 items-center gap-2 rounded-full pl-3 pr-4 text-sm text-foreground/90 transition hover:text-foreground"
      >
        <Menu className="size-4" />
        <span className="max-w-[9rem] truncate">{user ? user.displayName : t('nav.menu')}</span>
      </button>
      {open && (
        <nav
          role="menu"
          className="glass animate-rise absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-2xl p-1.5 text-sm"
        >
          {LINKS.filter((l) => import.meta.env.VITE_STATIC_DEMO !== 'true' && (!('account' in l) || isAccount(user)) && (!('user' in l) || !!user)).map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              role="menuitem"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-foreground/90 hover:bg-white/5"
            >
              <Icon className="size-4 text-primary" />
              {t(label)}
            </Link>
          ))}
          {import.meta.env.VITE_STATIC_DEMO !== 'true' && isAdmin(user) && (
            <Link to="/admin" role="menuitem" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-foreground/90 hover:bg-white/5">
              <ShieldCheck className="size-4 text-primary" /> {t('nav.admin')}
            </Link>
          )}
          <div className="my-1 border-t border-border" />
          <div className="flex items-center gap-3 px-3 py-2" role="group" aria-label={t('nav.language')}>
            <Languages className="size-4 text-primary" aria-hidden />
            {LANGS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLang(l.id)}
                aria-pressed={lang === l.id}
                lang={l.id}
                className={cn('rounded-full px-2.5 py-0.5 text-xs', lang === l.id ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="my-1 border-t border-border" />
          {import.meta.env.VITE_STATIC_DEMO === 'true' ? <p className="px-3 py-2 text-xs text-muted-foreground">Historical map demo · CShapes 2.0</p> : user ? (
            <>
              <p className="flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground">
                <UserIcon className="size-4" />
                {user.guest ? t('nav.guest') : user.email}
                {isAdmin(user) && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">admin</span>}
              </p>
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  await authApi.logout()
                  navigate('/')
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-foreground/90 hover:bg-white/5"
              >
                <LogOut className="size-4" /> {t('nav.signOut')}
              </button>
            </>
          ) : (
            <Link
              to={`/login?next=${encodeURIComponent(location.pathname)}`}
              role="menuitem"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-foreground/90 hover:bg-white/5"
            >
              <LogIn className="size-4 text-primary" /> {t('nav.signIn')}
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}
