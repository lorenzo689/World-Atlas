import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, NotebookPen } from 'lucide-react'
import { atlasApi, type CountryState, type TravelStatus } from '@/lib/backend'
import { isAccount, useAuth } from '@/store/auth'
import { useT, type MessageKey } from '@/i18n'
import { cn } from '@/lib/utils'

const OPTIONS: { id: TravelStatus | null; label: MessageKey }[] = [
  { id: null, label: 'atlas.status.NONE' },
  { id: 'WISHLIST', label: 'atlas.status.WISHLIST' },
  { id: 'VISITED', label: 'atlas.status.VISITED' },
  { id: 'LIVED', label: 'atlas.status.LIVED' },
]

/** "My atlas" quick actions in the country panel: favourite + travel status (signed-in accounts only). */
export function AtlasActions({ code }: { code: string }) {
  const t = useT()
  const user = useAuth((s) => s.user)
  const [state, setState] = useState<CountryState | null>(null)

  useEffect(() => {
    if (!isAccount(user)) return
    let alive = true
    atlasApi.country(code).then((s) => alive && setState(s)).catch(() => {})
    return () => {
      alive = false
    }
  }, [code, user])

  if (!isAccount(user) || !state) return null

  const toggleFavorite = async () => {
    const next = !state.favorite
    setState({ ...state, favorite: next }) // optimistic update
    try {
      await (next ? atlasApi.addFavorite(code) : atlasApi.removeFavorite(code))
    } catch {
      setState({ ...state, favorite: !next })
    }
  }

  const setTravel = async (status: TravelStatus | null) => {
    const previous = state.travel
    setState({ ...state, travel: status })
    try {
      await (status ? atlasApi.setTravel(code, { status }) : atlasApi.removeTravel(code))
    } catch {
      setState({ ...state, travel: previous })
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-border p-3">
      <div className="flex items-center justify-between">
        <p className="eyebrow">{t('nav.atlas')}</p>
        <div className="flex items-center gap-1">
          <Link
            to="/atlas"
            className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            title={t('atlas.tab.notes')}
          >
            <NotebookPen className="size-3.5" /> {state.notes}
          </Link>
          <button
            type="button"
            onClick={toggleFavorite}
            aria-pressed={state.favorite}
            aria-label={state.favorite ? t('atlas.removeFavorite') : t('atlas.addFavorite')}
            className="rounded-full p-1.5 hover:bg-white/5"
          >
            <Heart className={cn('size-4', state.favorite ? 'fill-primary text-primary' : 'text-muted-foreground')} />
          </button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1 rounded-full bg-white/5 p-1 text-[12px]">
        {OPTIONS.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => setTravel(o.id)}
            className={cn(
              'rounded-full py-1.5 transition',
              state.travel === o.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(o.label)}
          </button>
        ))}
      </div>
    </div>
  )
}
