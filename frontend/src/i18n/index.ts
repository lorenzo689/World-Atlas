import { useMemo } from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { en, type MessageKey } from './en'
import { de } from './de'

export type Lang = 'en' | 'de'
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
]

const dictionaries: Record<Lang, Partial<Record<MessageKey, string>>> = { en, de }

function detect(): Lang {
  if (typeof navigator === 'undefined') return 'en'
  return navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en'
}

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useLang = create<LangState>()(
  persist((set) => ({ lang: detect(), setLang: (lang) => set({ lang }) }), {
    name: 'world-explorer-lang',
    storage: createJSONStorage(() => localStorage),
  }),
)

export type T = (key: MessageKey, vars?: Record<string, string | number>) => string

/** Builds a translate function: German falls back to English, unknown keys to the key itself. */
export function makeT(lang: Lang): T {
  const dict = dictionaries[lang]
  return (key, vars) => {
    let text = dict[key] ?? en[key] ?? key
    if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v))
    return text
  }
}

export function useT(): T {
  const lang = useLang((s) => s.lang)
  return useMemo(() => makeT(lang), [lang])
}

/** For code outside React components (e.g. error messages in the API client). */
export const t: T = (key, vars) => makeT(useLang.getState().lang)(key, vars)

const regionNames = new Map<Lang, Intl.DisplayNames | null>()

/**
 * Localised country name from the ISO alpha-2 code, using the browser's built-in CLDR data
 * (`Intl.DisplayNames`) – no translation files needed for 250 countries.
 */
export function countryName(code2: string | null | undefined, lang: Lang, fallback: string): string {
  if (!code2 || lang === 'en') return fallback
  let names = regionNames.get(lang)
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames([lang], { type: 'region' })
    } catch {
      names = null
    }
    regionNames.set(lang, names)
  }
  try {
    const n = names?.of(code2.toUpperCase())
    return n && n !== code2.toUpperCase() ? n : fallback
  } catch {
    return fallback
  }
}

/** Number formatting in the current language (1,234.5 vs 1.234,5). */
export function useNumberFormat() {
  const lang = useLang((s) => s.lang)
  return useMemo(() => {
    const locale = lang === 'de' ? 'de-DE' : 'en-US'
    return (v: number, digits = 0) => v.toLocaleString(locale, { maximumFractionDigits: digits })
  }, [lang])
}

export type { MessageKey }
