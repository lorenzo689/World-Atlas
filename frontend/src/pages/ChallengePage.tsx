import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Copy, Crown, Swords } from 'lucide-react'
import { challengeApi, type Challenge } from '@/lib/backend'
import { useAuth } from '@/store/auth'
import { useDocumentMeta } from '@/hooks/useMisc'
import { useNumberFormat, useT } from '@/i18n'
import { Card, EmptyHint, ErrorText, PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** /challenge/:slug – a quiz duel: share the link, everybody plays the same questions, one ranking. */
export default function ChallengePage() {
  const t = useT()
  const fmt = useNumberFormat()
  const { slug = '' } = useParams()
  const user = useAuth((s) => s.user)
  const navigate = useNavigate()
  const [duel, setDuel] = useState<Challenge | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [copied, setCopied] = useState(false)

  useDocumentMeta({
    title: duel ? t('challenge.metaTitle', { name: duel.creatorName }) : `${t('challenge.title')} · World Explorer`,
    description: t('challenge.metaDescription'),
  })

  useEffect(() => {
    challengeApi.get(slug).then(setDuel).catch(setError)
  }, [slug])

  const play = () => {
    if (!user) navigate(`/login?next=${encodeURIComponent(`/quiz?challenge=${slug}`)}`)
    else navigate(`/quiz?challenge=${slug}`)
  }

  const link = `${window.location.origin}/challenge/${slug}`

  return (
    <PageShell title={t('challenge.title')} eyebrow={duel ? t('challenge.by', { name: duel.creatorName }) : ''}>
      <ErrorText error={error} />
      {duel && (
        <div className="grid gap-6 md:grid-cols-[340px_1fr]">
          <Card>
            <Swords className="size-8 text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">
              {t('challenge.explain', {
                rounds: duel.rounds,
                region: duel.region ? t(`region.${duel.region}` as 'region.Europe') : t('region.World'),
              })}
            </p>
            {duel.played ? (
              <p className="mt-5 rounded-2xl bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">{t('challenge.played')}</p>
            ) : (
              <Button className="mt-5 w-full" onClick={play}>
                {t('challenge.play')}
              </Button>
            )}
            <Button
              variant="outline"
              className="mt-3 w-full"
              onClick={async () => {
                if (navigator.share) {
                  await navigator.share({ title: t('challenge.shareTitle'), text: t('challenge.shareText'), url: link }).catch(() => {})
                } else {
                  await navigator.clipboard?.writeText(link)
                  setCopied(true)
                }
              }}
            >
              <Copy /> {copied ? t('common.copied') : t('challenge.share')}
            </Button>
            <p className="mt-2 break-all text-xs text-muted-foreground">{link}</p>
          </Card>
          <Card>
            <p className="eyebrow mb-3">{t('challenge.ranking')}</p>
            {duel.results.length === 0 && <EmptyHint>{t('challenge.empty')}</EmptyHint>}
            <ol className="divide-y divide-border">
              {duel.results.map((r) => (
                <li key={r.userId} className={cn('flex items-center gap-4 py-3', r.userId === user?.id && 'rounded-xl bg-primary/10 px-3')}>
                  <span className={cn('tabular w-6 text-right', r.rank <= 3 ? 'text-amber-300' : 'text-muted-foreground')}>{r.rank}</span>
                  {r.rank === 1 && <Crown className="size-4 text-amber-300" aria-label={t('common.winner')} />}
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.correct}/{r.total} · {Math.round(r.durationMs / 1000)} s
                  </span>
                  <span className="tabular w-20 text-right font-medium">{fmt(r.score)}</span>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-xs text-muted-foreground">
              <Link to="/quiz" className="text-primary hover:underline">{t('challenge.createOwn')}</Link>
            </p>
          </Card>
        </div>
      )}
    </PageShell>
  )
}
