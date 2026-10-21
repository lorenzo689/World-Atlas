import { useEffect, useState } from 'react'
import { api, backendAvailable } from '@/lib/api'
import { CONFLICT_BRIEFS, type ConflictBrief, validateConflictBriefs } from '@/lib/conflicts'

/** Live published revisions on the full stack, reviewed static snapshot on GitHub Pages/offline. */
export function useConflictBriefs(enabled = true): ConflictBrief[] {
  const [briefs, setBriefs] = useState(CONFLICT_BRIEFS)
  useEffect(() => {
    if (!enabled || import.meta.env.VITE_STATIC_DEMO === 'true') return
    let live = true
    backendAvailable().then((available) => live && available ? api<ConflictBrief[]>('/conflicts', { auth: false }) : CONFLICT_BRIEFS).then((next) => {
      if (live && next.length && validateConflictBriefs(next).every((issue) => issue.startsWith('Review outdated source:'))) setBriefs(next)
    }).catch(() => {})
    return () => { live = false }
  }, [enabled])
  return briefs
}
