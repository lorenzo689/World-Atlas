import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { ServerOff } from 'lucide-react'
import { Brand } from '@/components/layout/Brand'
import { UserMenu } from '@/components/layout/UserMenu'
import { Button } from '@/components/ui/button'
import { backendAvailable } from '@/lib/api'
import { isAccount, useAuth } from '@/store/auth'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'

/** Common frame for the non-globe pages: top bar, width-limited content, backend check. */
export function PageShell({
  title,
  eyebrow,
  actions,
  children,
  wide = false,
}: {
  title: string
  eyebrow?: string
  actions?: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  const t = useT()
  const [backend, setBackend] = useState<boolean | null>(null)
  useEffect(() => {
    backendAvailable().then(setBackend)
  }, [])

  return (
    <div className="min-h-full bg-[radial-gradient(ellipse_at_top,rgba(111,168,255,0.08),transparent_60%)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-background focus:px-4 focus:py-2">
        {t('common.skipToContent')}
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className={cn('mx-auto flex h-16 items-center gap-4 px-4 sm:px-6', wide ? 'max-w-7xl' : 'max-w-5xl')}>
          <Brand />
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link to="/" className="hidden rounded-full px-3 py-2 text-muted-foreground hover:text-foreground sm:block">
              {t('nav.globe')}
            </Link>
            <UserMenu />
          </nav>
        </div>
      </header>
      <main id="main" className={cn('mx-auto px-4 pb-24 pt-8 sm:px-6 sm:pt-12', wide ? 'max-w-7xl' : 'max-w-5xl')}>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h1 className="mt-1 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">{title}</h1>
          </div>
          {actions}
        </div>
        {backend === false ? <BackendDown /> : children}
      </main>
    </div>
  )
}

function BackendDown() {
  const t = useT()
  return (
    <div className="glass flex flex-col items-start gap-3 rounded-3xl p-8">
      <ServerOff className="size-8 text-destructive" />
      <h2 className="text-lg font-medium">{t('backend.down')}</h2>
      <p className="max-w-xl text-sm text-muted-foreground">{t('backend.downHint')}</p>
    </div>
  )
}

/** Redirects to the login page unless the visitor has an account (or at least a guest session). */
export function RequireUser({ children, account = false }: { children: ReactNode; account?: boolean }) {
  const user = useAuth((s) => s.user)
  const location = useLocation()
  if (!user || (account && !isAccount(user))) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}${account ? '&account=1' : ''}`} replace />
  }
  return <>{children}</>
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('glass rounded-3xl p-5 sm:p-6', className)}>{children}</section>
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null
  return <p className="mt-2 text-sm text-destructive">{error instanceof Error ? error.message : String(error)}</p>
}

export { Button }
