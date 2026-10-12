import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export type SheetSnap = 'peek' | 'full'

interface BottomSheetProps {
  children: React.ReactNode
  snap: SheetSnap
  onSnapChange: (s: SheetSnap) => void
  onDismiss: () => void
  label: string
  className?: string
}

/** Touch-friendly bottom sheet with two snap points. Drag the handle, or tap it to toggle. */
export function BottomSheet({ children, snap, onSnapChange, onDismiss, label, className }: BottomSheetProps) {
  const [drag, setDrag] = useState(0)
  const start = useRef<{ y: number; moved: boolean } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { y: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return
    const dy = e.clientY - start.current.y
    if (Math.abs(dy) > 4) start.current.moved = true
    setDrag(dy)
  }
  const onPointerUp = () => {
    const s = start.current
    start.current = null
    if (!s) return
    const dy = drag
    setDrag(0)
    if (!s.moved) return onSnapChange(snap === 'peek' ? 'full' : 'peek')
    if (dy < -50) onSnapChange('full')
    else if (dy > 50) snap === 'full' ? onSnapChange('peek') : onDismiss()
  }

  // Sheet height is fixed; only translateY changes between snaps so the animation stays on the compositor.
  const peekOffset = 'calc(100% - 44dvh)'
  const base = snap === 'full' ? '0px' : peekOffset
  return (
    <section
      role="dialog"
      aria-label={label}
      aria-modal="false"
      className={cn(
        'glass fixed inset-x-0 bottom-0 z-20 flex h-[86dvh] flex-col rounded-t-[28px] border-b-0',
        start.current ? '' : 'transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
        className,
      )}
      style={{ transform: `translateY(calc(${base} + ${Math.max(drag, snap === 'full' ? 0 : -400)}px))` }}
    >
      <div
        className="flex shrink-0 cursor-grab touch-none justify-center pb-2 pt-3 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="button"
        tabIndex={0}
        aria-label={snap === 'peek' ? 'Expand panel' : 'Collapse panel'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSnapChange(snap === 'peek' ? 'full' : 'peek')
          }
        }}
      >
        <span className="h-1.5 w-11 rounded-full bg-white/20" />
      </div>
      <div className={cn('scrollbar-thin min-h-0 flex-1 pb-6', snap === 'full' ? 'overflow-y-auto' : 'overflow-hidden')}>
        {children}
      </div>
    </section>
  )
}
