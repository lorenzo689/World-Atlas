import { useEffect, useState, useSyncExternalStore } from 'react'
import type { LoadState } from '@/types'
import { fetchCountrySummary, type WikiSummary } from '@/lib/wikipedia'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export const useIsDesktop = () => useMediaQuery('(min-width: 768px)')
export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)')

interface MetaOptions {
  title: string
  description: string
  path?: string
  jsonLd?: Record<string, unknown> | null
}

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

/** Keeps <title>, description, canonical, Open Graph tags and JSON-LD in sync with the current view. */
export function useDocumentMeta({ title, description, path, jsonLd }: MetaOptions) {
  useEffect(() => {
    document.title = title
    setMeta('meta[name="description"]', 'name', 'description', description)
    setMeta('meta[property="og:title"]', 'property', 'og:title', title)
    setMeta('meta[property="og:description"]', 'property', 'og:description', description)

    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'canonical'
      document.head.appendChild(link)
    }
    link.href = window.location.origin + (path ?? window.location.pathname)

    let script: HTMLScriptElement | null = null
    if (jsonLd) {
      script = document.createElement('script')
      script.type = 'application/ld+json'
      script.dataset.managed = 'true'
      script.textContent = JSON.stringify(jsonLd)
      document.head.appendChild(script)
    }
    return () => {
      script?.remove()
    }
  }, [title, description, path, jsonLd])
}

export function useWikiSummary(name: string | undefined, officialName?: string): LoadState<WikiSummary | null> {
  const [state, setState] = useState<LoadState<WikiSummary | null>>({ status: 'loading' })
  useEffect(() => {
    if (!name) return
    let live = true
    setState({ status: 'loading' })
    fetchCountrySummary(name, officialName).then(
      (data) => live && setState({ status: 'success', data }),
      (error: Error) => live && setState({ status: 'error', error }),
    )
    return () => {
      live = false
    }
  }, [name, officialName])
  return state
}
