import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { ApiError, authApi } from '@/lib/api'
import { useDocumentMeta } from '@/hooks/useMisc'
import { useLang, useT } from '@/i18n'
import { Card, ErrorText, PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/pages/LoginPage'

/** /verify?token=… – the link from the confirmation e-mail. */
export function VerifyEmailPage() {
  const t = useT()
  const lang = useLang((state) => state.lang)
  useDocumentMeta({ title: `${t('verify.title')} · World Explorer`, description: t('verify.title') })
  const [params] = useSearchParams()
  const [state, setState] = useState<'working' | 'done' | 'error'>('working')
  const [error, setError] = useState<unknown>(null)
  const once = useRef(false)

  useEffect(() => {
    if (once.current) return // StrictMode runs effects twice in dev; the token is single-use
    once.current = true
    authApi
      .verify(params.get('token') ?? '')
      .then(() => setState('done'))
      .catch((e) => {
        setError(e)
        setState('error')
      })
  }, [params])

  return (
    <PageShell title={t('verify.title')} eyebrow={t('login.eyebrow')}>
      <Card className="mx-auto max-w-md">
        {state === 'working' && <div className="skeleton h-6 w-48" />}
        {state === 'done' && (
          <div className="flex flex-col items-start gap-4">
            <p className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="size-5" /> {t('verify.done')}
            </p>
            <Button asChild>
              <Link to="/scenarios">{lang === 'de' ? 'Szenarien erkunden' : 'Explore scenarios'}</Link>
            </Button>
          </div>
        )}
        {state === 'error' && <ErrorText error={error} />}
      </Card>
    </PageShell>
  )
}

/** /reset-password?token=… – the link from the reset e-mail. */
export function ResetPasswordPage() {
  const t = useT()
  useDocumentMeta({ title: `${t('reset.title')} · World Explorer`, description: t('reset.title') })
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<ApiError | Error | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== repeat) {
      setError(new Error(t('reset.mismatch')))
      return
    }
    setBusy(true)
    try {
      await authApi.resetPassword(params.get('token') ?? '', password)
      navigate('/scenarios', { replace: true })
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell title={t('reset.title')} eyebrow={t('login.eyebrow')}>
      <Card className="mx-auto max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input
            label={t('reset.newPassword')}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            hint={t('login.passwordHint')}
            error={error instanceof ApiError ? error.fields.password : undefined}
          />
          <Input label={t('reset.repeat')} type="password" autoComplete="new-password" value={repeat} onChange={setRepeat} />
          <Button type="submit" disabled={busy || !password}>{t('reset.save')}</Button>
          <ErrorText error={error && !(error instanceof ApiError && error.fields.password) ? error : null} />
        </form>
      </Card>
    </PageShell>
  )
}
