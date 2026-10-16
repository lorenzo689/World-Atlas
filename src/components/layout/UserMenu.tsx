import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, BookMarked, Gamepad2, LogIn, LogOut, Menu, Swords, Trophy, User as UserIcon } from 'lucide-react'
import { authApi } from '@/lib/api'
import { isAccount, isAdmin, useAuth } from '@/store/auth'
import { cn } from '@/lib/utils'

const LINKS = [
  { to: '/quiz', label: 'Geo quiz', icon: Gamepad2 },
  { to: '/play', label: 'Multiplayer', icon: Swords },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/data', label: 'Data platform', icon: BarChart3 },
  { to: '/atlas', label: 'My atlas', icon: BookMarked, account: true },
] as const

/** Navigation + account menu, shown in the top bar of every page. */
export function UserMenu({ className }: { className?: string }) {
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
        <span className="max-w-[9rem] truncate">{user ? user.displayName : 'Menu'}</span>
      </button>
      {open && (
        <nav
          role="menu"
          className="glass animate-rise absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-2xl p-1.5 text-sm"
        >
          {LINKS.filter((l) => !('account' in l) || isAccount(user)).map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              role="menuitem"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-foreground/90 hover:bg-white/5"
            >
              <Icon className="size-4 text-primary" />
              {label}
            </Link>
          ))}
          <div className="my-1 border-t border-border" />
          {user ? (
            <>
              <p className="flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground">
                <UserIcon className="size-4" />
                {user.guest ? 'Guest' : user.email}
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
                <LogOut className="size-4" /> Sign out
              </button>
            </>
          ) : (
            <Link
              to={`/login?next=${encodeURIComponent(location.pathname)}`}
              role="menuitem"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-foreground/90 hover:bg-white/5"
            >
              <LogIn className="size-4 text-primary" /> Sign in / create account
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}
