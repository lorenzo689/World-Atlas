import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, authApi } from '@/lib/api'
import { useAuth } from '@/store/auth'
import { useDocumentMeta } from '@/hooks/useMisc'
import { Card, PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Tab = 'login' | 'register' | 'guest'

export default function LoginPage() {
  useDocumentMeta({ title: 'Sign in · World Explorer', description: 'Sign in to play, save your atlas and climb the leaderboard.' })
  const [params] = useSearchParams()
  const needsAccount = params.get('account') === '1'
  const [tab, setTab] = useState<Tab>(needsAccount ? 'register' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const setSession = useAuth((s) => s.setSession)
  const navigate = useNavigate()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res =
        tab === 'login'
          ? await authApi.login(email, password)
          : tab === 'register'
            ? await authApi.register(email, password, name)
            : await authApi.guest(name)
      setSession(res)
      navigate(params.get('next') || '/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'network', 'Could not reach the server.'))
    } finally {
      setBusy(false)
    }
  }

  const field = (key: string) => error?.fields[key]

  return (
    <PageShell title="Welcome" eyebrow="Your account">
      <Card className="mx-auto max-w-md">
        {needsAccount && (
          <p className="mb-4 rounded-2xl bg-primary/10 p-3 text-sm text-primary">
            The personal atlas needs an account. Guests can play quizzes and multiplayer.
          </p>
        )}
        <div role="tablist" className="mb-6 grid grid-cols-3 gap-1 rounded-full bg-white/5 p-1 text-sm">
          {(['login', 'register', 'guest'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t)
                setError(null)
              }}
              className={cn(
                'rounded-full py-2 transition',
                tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'login' ? 'Sign in' : t === 'register' ? 'Create account' : 'Play as guest'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {tab !== 'guest' && (
            <Input label="E-mail" type="email" autoComplete="email" value={email} onChange={setEmail} error={field('email')} />
          )}
          {tab !== 'guest' && (
            <Input
              label="Password"
              type="password"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={setPassword}
              error={field('password')}
              hint={tab === 'register' ? 'At least 8 characters' : undefined}
            />
          )}
          {tab !== 'login' && (
            <Input label="Display name" value={name} onChange={setName} error={field('displayName')} hint="Shown on leaderboards" />
          )}
          {error && Object.keys(error.fields).length === 0 && <p className="text-sm text-destructive">{error.message}</p>}
          <Button type="submit" disabled={busy} className="mt-2">
            {busy ? 'Please wait…' : tab === 'login' ? 'Sign in' : tab === 'register' ? 'Create account' : 'Continue as guest'}
          </Button>
          {tab === 'guest' && (
            <p className="text-xs text-muted-foreground">
              Guests get a nickname for quizzes and multiplayer. Create an account to keep a personal atlas.
            </p>
          )}
        </form>
      </Card>
    </PageShell>
  )
}

function Input({
  label,
  value,
  onChange,
  error,
  hint,
  ...rest
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="eyebrow">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        className="h-11 rounded-xl border border-input bg-white/[0.03] px-3.5 text-[15px] outline-none transition focus:border-primary aria-[invalid=true]:border-destructive"
      />
      {(error || hint) && <span className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{error ?? hint}</span>}
    </label>
  )
}
