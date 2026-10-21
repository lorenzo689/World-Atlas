import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, authApi } from '@/lib/api'
import { useDocumentMeta } from '@/hooks/useMisc'
import { useT } from '@/i18n'
import { Card, PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Tab = 'login' | 'register' | 'guest' | 'forgot'

export default function LoginPage() {
  const t = useT()
  useDocumentMeta({ title: `${t('login.title')} · World Explorer`, description: t('login.metaDescription') })
  const [params] = useSearchParams()
  const needsAccount = params.get('account') === '1'
  const requestedTab = params.get('tab')
  const [tab, setTab] = useState<Tab>(needsAccount || requestedTab === 'register' ? 'register' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const navigate = useNavigate()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (tab === 'forgot') {
        await authApi.forgotPassword(email)
        setSent(true)
        return
      }
      if (tab === 'login') await authApi.login(email, password)
      else if (tab === 'register') await authApi.register(email, password, name)
      else await authApi.guest(name)
      navigate(safeNext(params.get('next')), { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'network', t('error.network')))
    } finally {
      setBusy(false)
    }
  }

  const switchTo = (next: Tab) => {
    setTab(next)
    setError(null)
    setSent(false)
  }
  const field = (key: string) => error?.fields[key]
  const submitLabel = { login: t('login.signIn'), register: t('login.createAccount'), guest: t('login.continueGuest'), forgot: t('login.sendLink') }[tab]

  return (
    <PageShell title={t('login.title')} eyebrow={t('login.eyebrow')}>
      <Card className="mx-auto max-w-md">
        {needsAccount && <p className="mb-4 rounded-2xl bg-primary/10 p-3 text-sm text-primary">{t('login.needsAccount')}</p>}
        {tab !== 'forgot' && (
          <div role="tablist" aria-label={t('login.title')} className="mb-6 grid grid-cols-3 gap-1 rounded-full bg-white/5 p-1 text-sm">
            {(['login', 'register', 'guest'] as const).map((id) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={tab === id}
                onClick={() => switchTo(id)}
                className={cn(
                  'rounded-full px-1 py-2 transition',
                  tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {id === 'login' ? t('login.signIn') : id === 'register' ? t('login.createAccount') : t('login.guest')}
              </button>
            ))}
          </div>
        )}
        {tab === 'forgot' && (
          <div className="mb-5">
            <h2 className="text-lg font-medium">{t('login.forgotTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('login.forgotHint')}</p>
          </div>
        )}
        {sent ? (
          <div role="status" className="rounded-2xl bg-emerald-400/10 p-4 text-sm text-emerald-300">
            {t('login.linkSent')}
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            {tab !== 'guest' && (
              <Input label={t('login.email')} type="email" autoComplete="email" value={email} onChange={setEmail} error={field('email')} required />
            )}
            {(tab === 'login' || tab === 'register') && (
              <Input
                label={t('login.password')}
                type="password"
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={setPassword}
                error={field('password')}
                hint={tab === 'register' ? t('login.passwordHint') : undefined}
                required
              />
            )}
            {(tab === 'register' || tab === 'guest') && (
              <Input label={t('login.displayName')} value={name} onChange={setName} error={field('displayName')} hint={t('login.displayNameHint')} required />
            )}
            {error && Object.keys(error.fields).length === 0 && (
              <p className="text-sm text-destructive" role="alert">{error.message}</p>
            )}
            <Button type="submit" disabled={busy} className="mt-2">
              {busy ? t('common.wait') : submitLabel}
            </Button>
            {tab === 'login' && (
              <button type="button" onClick={() => switchTo('forgot')} className="text-center text-sm text-muted-foreground hover:text-foreground">
                {t('login.forgot')}
              </button>
            )}
            {tab === 'guest' && <p className="text-xs text-muted-foreground">{t('login.guestHint')}</p>}
            {tab === 'register' && <p className="text-xs text-muted-foreground">{t('login.verifyHint')}</p>}
          </form>
        )}
        {tab === 'forgot' && (
          <button type="button" onClick={() => switchTo('login')} className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground">
            {t('login.backToSignIn')}
          </button>
        )}
      </Card>
    </PageShell>
  )
}

/** Keep post-auth navigation on this origin; a crafted next= URL must not become an open redirect. */
function safeNext(candidate: string | null): string {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return '/scenarios'
  try {
    const target = new URL(candidate, window.location.origin)
    return target.origin === window.location.origin ? `${target.pathname}${target.search}${target.hash}` : '/scenarios'
  } catch {
    return '/scenarios'
  }
}

export function Input({
  label,
  value,
  onChange,
  error,
  hint,
  id,
  ...rest
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  const inputId = id ?? `in-${label.replace(/\W+/g, '-').toLowerCase()}`
  const hintId = `${inputId}-hint`
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={inputId} className="eyebrow">{label}</label>
      <input
        {...rest}
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error || hint ? hintId : undefined}
        className="h-11 rounded-xl border border-input bg-white/[0.03] px-3.5 text-[15px] outline-none transition focus:border-primary aria-[invalid=true]:border-destructive"
      />
      {(error || hint) && (
        <span id={hintId} className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
          {error ?? hint}
        </span>
      )}
    </div>
  )
}
