import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ExternalLink, RotateCcw, ShieldCheck } from 'lucide-react'
import { adminApi, dataApi, type AdminUser, type IndicatorInfo, type OutboxStatus } from '@/lib/backend'
import { isAdmin, useAuth } from '@/store/auth'
import { useDocumentMeta } from '@/hooks/useMisc'
import { useLang, useT } from '@/i18n'
import { Card, ErrorText, PageShell } from '@/components/layout/PageShell'
import { IngestionCard, OverviewCard } from '@/pages/DataPage'
import { cn } from '@/lib/utils'

/** Admin console: system overview (all four data stores + Kafka lag), ingestion, users and roles. */
export default function AdminPage() {
  const t = useT()
  const user = useAuth((s) => s.user)
  useDocumentMeta({ title: `${t('admin.title')} · World Explorer`, description: t('admin.title') })
  if (!isAdmin(user)) return <Navigate to="/" replace />
  return (
    <PageShell title={t('admin.title')} eyebrow={t('admin.eyebrow')} wide>
      <div className="grid gap-6 lg:grid-cols-2">
        <OverviewCard />
        <IngestionCardLoader />
      </div>
      <OutboxCard />
      <UsersCard />
      <Card className="mt-6">
        <p className="eyebrow mb-3">{t('admin.tools')}</p>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {[
            ['Swagger UI', '/swagger-ui.html'],
            ['Grafana', 'http://localhost:3000'],
            ['Jaeger', 'http://localhost:16686'],
            ['Kafka UI', 'http://localhost:8090'],
            ['Mailpit', 'http://localhost:8026'],
            ['Prometheus', 'http://localhost:9090'],
          ].map(([label, href]) => (
            <li key={label}>
              <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                <ExternalLink className="size-3.5" /> {label}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">{t('admin.toolsHint')}</p>
      </Card>
    </PageShell>
  )
}

function OutboxCard() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [status, setStatus] = useState<OutboxStatus | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [retrying, setRetrying] = useState<string | null>(null)

  const load = () => adminApi.outbox().then((next) => { setStatus(next); setError(null) }).catch(setError)
  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [])

  const retry = async (id: string) => {
    setRetrying(id)
    try {
      await adminApi.retryOutbox(id)
      await load()
    } catch (e) {
      setError(e)
    } finally {
      setRetrying(null)
    }
  }

  return (
    <Card className="mt-6">
      <p className="eyebrow mb-4">{t('admin.outboxTitle')}</p>
      {status && (
        <>
          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <div><p className="text-muted-foreground">{t('admin.outboxPending')}</p><p className="tabular text-2xl">{status.pending}</p></div>
            <div><p className="text-muted-foreground">{t('admin.outboxFailed')}</p><p className={cn('tabular text-2xl', status.failed > 0 && 'text-amber-300')}>{status.failed}</p></div>
            <div><p className="text-muted-foreground">{t('admin.outboxOldest')}</p><p>{status.oldestPending ? new Date(status.oldestPending).toLocaleString(lang) : '—'}</p></div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t('admin.outboxHint')}</p>
          {status.failures.length > 0 && (
            <ul className="mt-4 divide-y divide-border text-sm">
              {status.failures.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{event.topic} <span className="text-xs text-muted-foreground">· {event.attempts} {t('admin.outboxAttempts')}</span></p>
                    <p className="truncate text-xs text-muted-foreground" title={event.lastError ?? undefined}>{event.lastError ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString(lang)}</p>
                  </div>
                  <button type="button" disabled={retrying !== null} onClick={() => retry(event.id)} className="inline-flex items-center gap-1 rounded-full border border-input px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-40">
                    <RotateCcw className="size-3" /> {t('admin.outboxRetry')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <ErrorText error={error} />
    </Card>
  )
}

function IngestionCardLoader() {
  const [catalog, setCatalog] = useState<IndicatorInfo[]>([])
  useEffect(() => {
    dataApi.catalog().then(setCatalog).catch(() => {})
  }, [])
  return <IngestionCard catalog={catalog} />
}

const ROLE_OPTIONS = ['USER', 'ADMIN'] as const

function UsersCard() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const me = useAuth((s) => s.user)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<unknown>(null)

  const load = () => adminApi.users().then(setUsers).catch(setError)
  useEffect(() => {
    load()
  }, [])

  const toggle = async (u: AdminUser, role: string) => {
    const roles = u.roles.includes(role) ? u.roles.filter((r) => r !== role) : [...u.roles, role]
    try {
      await adminApi.setRoles(u.id, roles.length ? roles : ['USER'])
      await load()
    } catch (e) {
      setError(e)
    }
  }

  return (
    <Card className="mt-6">
      <p className="eyebrow mb-4 flex items-center gap-2">
        <ShieldCheck className="size-4 text-primary" /> {t('admin.users')}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2 font-normal">{t('admin.name')}</th>
              <th className="py-2 font-normal">{t('login.email')}</th>
              <th className="py-2 font-normal">{t('admin.registered')}</th>
              <th className="py-2 font-normal">{t('admin.roles')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users?.map((u) => (
              <tr key={u.id}>
                <td className="py-2.5">{u.displayName}{u.guest && <span className="ml-2 text-xs text-muted-foreground">{t('admin.guest')}</span>}</td>
                <td className="py-2.5 text-muted-foreground">
                  {u.email ?? '—'} {u.email && (u.emailVerified ? '✓' : '')}
                </td>
                <td className="py-2.5 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString(lang)}</td>
                <td className="py-2.5">
                  <div className="flex gap-1.5">
                    {ROLE_OPTIONS.map((role) => (
                      <button
                        key={role}
                        type="button"
                        disabled={u.guest || (u.id === me?.id && role === 'ADMIN')}
                        aria-pressed={u.roles.includes(role)}
                        onClick={() => toggle(u, role)}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs transition disabled:opacity-40',
                          u.roles.includes(role) ? 'border-primary bg-primary/15' : 'border-input text-muted-foreground',
                        )}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t('admin.rolesHint')}</p>
      <ErrorText error={error} />
    </Card>
  )
}
