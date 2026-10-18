import { beforeEach, describe, expect, it } from 'vitest'
import { countryName, makeT, useLang } from '@/i18n'
import { en } from '@/i18n/en'
import { de } from '@/i18n/de'
import { Achievement_CODES } from './achievements'

describe('translate function', () => {
  it('fills placeholders', () => {
    expect(makeT('en')('quiz.questionOf', { n: 3, total: 10 })).toBe('Question 3 of 10')
    expect(makeT('de')('quiz.questionOf', { n: 3, total: 10 })).toBe('Frage 3 von 10')
  })

  it('falls back to English for keys missing in German and to the key itself when unknown', () => {
    const t = makeT('de')
    // @ts-expect-error – deliberately unknown key
    expect(t('does.not.exist')).toBe('does.not.exist')
    expect(makeT('en')('common.cancel')).toBe('Cancel')
  })
})

describe('dictionaries', () => {
  it('German has no keys that English lacks (typos)', () => {
    const unknown = Object.keys(de).filter((k) => !(k in en))
    expect(unknown).toEqual([])
  })

  it('every English text is translated to German', () => {
    const missing = Object.keys(en).filter((k) => !(k in de))
    expect(missing).toEqual([])
  })

  it('placeholders are the same in both languages', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const [key, text] of Object.entries(de)) {
      expect(vars(text as string), key).toEqual(vars(en[key as keyof typeof en]))
    }
  })

  it('has a title and description for every backend badge', () => {
    for (const code of Achievement_CODES) {
      expect(en, code).toHaveProperty(`ach.${code}.title`)
      expect(en, code).toHaveProperty(`ach.${code}.desc`)
    }
  })
})

describe('country names', () => {
  it('translates through Intl.DisplayNames', () => {
    expect(countryName('DE', 'de', 'Germany')).toBe('Deutschland')
    expect(countryName('ES', 'de', 'Spain')).toBe('Spanien')
  })
  it('keeps the English name in English and for unknown codes', () => {
    expect(countryName('DE', 'en', 'Germany')).toBe('Germany')
    expect(countryName(null, 'de', 'Nowhere')).toBe('Nowhere')
  })
})

describe('language store', () => {
  beforeEach(() => useLang.setState({ lang: 'en' }))
  it('switches the language', () => {
    useLang.getState().setLang('de')
    expect(useLang.getState().lang).toBe('de')
  })
})
