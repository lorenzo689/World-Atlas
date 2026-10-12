import { cn } from '@/lib/utils'

interface FlagProps {
  code: string // alpha-3
  name: string
  className?: string
}

/** Flag SVG served locally from /flags (flag-icons, 4:3). */
export function Flag({ code, name, className }: FlagProps) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}flags/${code}.svg`}
      alt={`Flag of ${name}`}
      loading="lazy"
      decoding="async"
      className={cn('aspect-[4/3] rounded-[5px] object-cover ring-1 ring-white/15', className)}
    />
  )
}
