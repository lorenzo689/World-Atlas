import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label="World Explorer — home"
      className={cn('group flex items-center gap-2.5 rounded-full', className)}
    >
      <svg viewBox="0 0 32 32" className="size-7 text-primary transition-transform duration-700 group-hover:rotate-[24deg]" aria-hidden>
        <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <ellipse cx="16" cy="16" rx="5" ry="12" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".7" />
        <path d="M4 16h24M6 10h20M6 22h20" stroke="currentColor" strokeWidth="1" opacity=".5" />
      </svg>
      <span className="hidden font-serif text-[26px] leading-none tracking-tight sm:block">World Explorer</span>
    </Link>
  )
}
