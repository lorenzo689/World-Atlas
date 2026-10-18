import { useEffect, useState } from 'react'
import { Flame, Lock } from 'lucide-react'
import { achievementApi, type AchievementOverview } from '@/lib/backend'
import { useDocumentMeta } from '@/hooks/useMisc'
import { useLang, useT, type MessageKey } from '@/i18n'
import { Card, ErrorText, PageShell, RequireUser } from '@/components/layout/PageShell'
import { cn } from '@/lib/utils'

export default function AchievementsPage() {
  const t = useT()
  useDocumentMeta({ title: `${t('ach.title')} · World Explorer`, description: t('ach.metaDescription') })
  return (
    <RequireUser>
      <Achievements />
    </RequireUser>
  )
}

function Achievements() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [data, setData] = useState<AchievementOverview | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    achievementApi.mine().then(setData).catch(setError)
  }, [])

  return (
    <PageShell title={t('ach.title')} eyebrow={t('ach.eyebrow')}>
      <ErrorText error={error} />
      {data && (
        <>
          <div className="grid gap-6 md:grid-cols-[280px_1fr]">
            <Card>
              <p className="eyebrow">{t('ach.dailyStreak')}</p>
              <p className="mt-2 flex items-center gap-3 font-serif text-6xl">
                <Flame className={cn('size-10', data.currentStreak > 0 ? 'text-amber-300' : 'text-muted-foreground')} aria-hidden />
                <span className="tabular">{data.currentStreak}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{t('ach.bestStreak', { n: data.bestStreak })}</p>
              <p className="mt-6 text-sm">
                {t('ach.unlockedOf', { n: data.unlocked, total: data.achievements.length })}
              </p>
            </Card>
            <Card>
              <p className="eyebrow mb-4">{t('ach.knowledge')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.knowledge.map((k) => (
                  <div key={k.region}>
                    <div className="flex justify-between text-sm">
                      <span>{t(`region.${k.region}` as MessageKey)}</span>
                      <span className="tabular text-muted-foreground">{k.countries}/{k.total}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5" role="progressbar" aria-valuemin={0} aria-valuemax={k.total} aria-valuenow={k.countries} aria-label={t(`region.${k.region}` as MessageKey)}>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(k.countries / Math.max(1, k.total)) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">{t('ach.knowledgeHint')}</p>
            </Card>
          </div>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.achievements.map((a) => (
              <li key={a.code}>
                <Card className={cn('flex h-full items-start gap-4', !a.unlocked && 'opacity-55')}>
                  <span className={cn('text-4xl', !a.unlocked && 'grayscale')} aria-hidden>{a.icon}</span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {t(`ach.${a.code}.title` as MessageKey) === `ach.${a.code}.title` ? a.title : t(`ach.${a.code}.title` as MessageKey)}
                      {!a.unlocked && <Lock className="size-3.5 text-muted-foreground" aria-label={t('ach.locked')} />}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t(`ach.${a.code}.desc` as MessageKey) === `ach.${a.code}.desc` ? a.description : t(`ach.${a.code}.desc` as MessageKey)}
                    </p>
                    {a.unlockedAt && (
                      <p className="mt-2 text-xs text-emerald-300">
                        {t('ach.unlockedOn', { date: new Date(a.unlockedAt).toLocaleDateString(lang) })}
                      </p>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </PageShell>
  )
}
