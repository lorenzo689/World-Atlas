import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
  compact,
}: {
  title?: string
  message?: string
  onRetry?: () => void
  className?: string
  compact?: boolean
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border text-center',
        compact ? 'p-5' : 'p-10',
        className,
      )}
    >
      <AlertTriangle className="size-5 text-muted-foreground" aria-hidden />
      <div>
        <p className="text-sm font-medium">{title}</p>
        {message && <p className="mt-1 text-xs text-muted-foreground">{message}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw /> Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground', className)}>
      {children}
    </div>
  )
}
