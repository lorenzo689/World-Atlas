import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import { createRealtime } from '@/lib/realtime'
import { useAuth } from '@/store/auth'
import { useLang, useT, type MessageKey } from '@/i18n'

interface Toast {
  id: number
  code: string
  title: string
  icon: string
}

/** Global overlay: "badge unlocked" toasts pushed by the backend over WebSocket, plus an offline banner. */
export function Notifications() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const userId = useAuth((s) => s.user?.id)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [online, setOnline] = useState(() => navigator.onLine)

  // keep <html lang> in sync for screen readers and translation tools
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    const rt = createRealtime()
    const off = rt.subscribe('/user/queue/notifications', (e) => {
      if (e.type !== 'ACHIEVEMENT_UNLOCKED') return
      const d = e.data as { code: string; title: string; icon: string }
      const toast = { id: Date.now() + Math.random(), code: d.code, title: d.title, icon: d.icon }
      setToasts((list) => [...list, toast])
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== toast.id)), 6000)
    })
    return () => {
      off()
      rt.close()
    }
  }, [userId])

  return (
    <>
      {!online && (
        <div role="status" className="glass fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 py-1.5 text-xs">
          <WifiOff className="size-3.5" aria-hidden /> {t('common.offline')}
        </div>
      )}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2" aria-live="polite">
        {toasts.map((x) => {
          const key = `ach.${x.code}.title` as MessageKey
          const title = t(key) === key ? x.title : t(key)
          return (
            <Link key={x.id} to="/achievements" className="glass animate-rise pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-sm">
              <span className="text-2xl" aria-hidden>{x.icon}</span>
              <span>
                <span className="eyebrow block">{t('ach.title')}</span>
                {title}
              </span>
            </Link>
          )
        })}
      </div>
    </>
  )
}
