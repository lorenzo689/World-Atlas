import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { HistoricalEntity } from '@/lib/history'
import { useT } from '@/i18n'

interface Props {
  entities: Map<string, HistoricalEntity>
  onSelect: (code: string) => void
  className?: string
}

export function HistoricalSearchBox({ entities, onSelect, className = '' }: Props) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const hits = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    if (!q) return []
    return [...entities.values()].filter((e) => e.name.toLocaleLowerCase().includes(q) || e.capital?.toLocaleLowerCase().includes(q)).slice(0, 8)
  }, [entities, query])
  const choose = (code: string) => {
    onSelect(code)
    setQuery('')
    setOpen(false)
  }
  return (
    <div className={`relative ${className}`}>
      <div className="glass flex h-11 items-center gap-2 rounded-full px-4">
        <Search aria-hidden className="size-4 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits.length) { e.preventDefault(); choose(hits[0].code) }
            if (e.key === 'Escape') setOpen(false)
          }}
          aria-label={t('history.search')}
          placeholder={t('history.search')}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open && query && (
        <ul className="glass absolute inset-x-0 top-12 z-50 max-h-72 overflow-auto rounded-2xl p-1 shadow-2xl">
          {hits.map((entity) => (
            <li key={entity.code}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(entity.code)} className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10">
                {entity.name}
                {entity.capital && <span className="ml-2 text-xs text-muted-foreground">{entity.capital}</span>}
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">{t('history.noResults')}</li>}
        </ul>
      )}
    </div>
  )
}
