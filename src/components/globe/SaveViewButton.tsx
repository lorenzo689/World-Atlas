import { useState } from 'react'
import { Bookmark, Check, Link2 } from 'lucide-react'
import { atlasApi, type SavedView } from '@/lib/backend'
import { useExplorer } from '@/store/explorer'
import { isAccount, useAuth } from '@/store/auth'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Saves the current camera, mode, metric and selection as a (shareable) view in the personal atlas. */
export function SaveViewButton({ className }: { className?: string }) {
  const user = useAuth((s) => s.user)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [saved, setSaved] = useState<SavedView | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isAccount(user)) return null

  const save = async () => {
    const s = useExplorer.getState()
    const pose = s.view ?? { lat: 20, lng: 10, altitude: 2.3 }
    try {
      const view = await atlasApi.createView({
        name: name.trim() || 'My view',
        mode: s.mode,
        metric: s.mode === 'data' ? s.metric : null,
        lat: Math.max(-90, Math.min(90, pose.lat)),
        lng: ((((pose.lng + 180) % 360) + 360) % 360) - 180,
        altitude: Math.max(0.05, Math.min(10, pose.altitude)),
        selectedCountry: s.selected,
        isPublic,
      })
      setSaved(view)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    }
  }

  return (
    <div className={cn('relative', className)}>
      <Button variant="outline" size="sm" className="glass" onClick={() => { setOpen((o) => !o); setSaved(null) }}>
        <Bookmark /> Save view
      </Button>
      {open && (
        <div className="glass animate-rise absolute bottom-11 right-0 w-72 rounded-2xl p-4 text-sm">
          {saved ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-emerald-300">
                <Check className="size-4" /> Saved to your atlas
              </p>
              {saved.isPublic && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/views/${saved.slug}`)}
                >
                  <Link2 /> Copy share link
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name, e.g. “Alps from above”"
                maxLength={80}
                className="h-9 rounded-full border border-input bg-white/[0.03] px-3.5 outline-none focus:border-primary"
              />
              <label className="flex items-center gap-2 text-muted-foreground">
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="accent-[var(--primary)]" />
                Anyone with the link can open it
              </label>
              <Button size="sm" onClick={save}>Save</Button>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
