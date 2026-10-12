import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { Country } from '@/types'
import { useCountries } from '@/hooks/useCountries'
import { searchCountries } from '@/lib/search'
import { cn } from '@/lib/utils'
import { Flag } from '@/components/country/Flag'

interface SearchBoxProps {
  onSelect: (country: Country) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}

/** Accessible combobox (ARIA 1.2 pattern) with diacritic-insensitive country autocomplete. */
export function SearchBox({ onSelect, placeholder = 'Search countries, capitals…', className, autoFocus }: SearchBoxProps) {
  const { index, status } = useCountries()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const results = useMemo(() => searchCountries(index, query, 8), [index, query])
  const showList = open && query.trim().length > 0

  useEffect(() => setActive(0), [query])

  // "/" or Ctrl/⌘+K focuses the search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const choose = (c: Country) => {
    onSelect(c)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const c = results[active]
      if (c) {
        e.preventDefault()
        choose(c)
      }
    } else if (e.key === 'Escape') {
      if (query) setQuery('')
      else inputRef.current?.blur()
      setOpen(false)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <div className="glass flex h-12 items-center gap-3 rounded-full px-4 transition-shadow focus-within:shadow-[0_0_0_1px_rgba(111,168,255,0.55),0_24px_60px_-20px_rgba(0,0,0,0.7)]">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${results[active].code}` : undefined}
          aria-label="Search countries"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          disabled={status !== 'ready'}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/80 focus-visible:outline-none"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
            className="rounded-full p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : (
          <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground sm:block">/</kbd>
        )}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching countries"
          className="glass animate-fade absolute inset-x-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-3xl p-1.5"
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted-foreground" role="presentation">
              No country matches “{query}”
            </li>
          ) : (
            results.map((c, i) => (
              <li
                key={c.code}
                id={`${listId}-${c.code}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(c)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5',
                  i === active && 'bg-white/[0.07]',
                )}
              >
                <Flag code={c.code} name={c.name} className="h-[18px] w-6" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[c.capital[0], c.subregion ?? c.region].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="text-[11px] tracking-wider text-muted-foreground">{c.code}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
