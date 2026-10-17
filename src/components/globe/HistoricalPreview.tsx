import { X } from 'lucide-react'
import type { HistoricalEntity } from '@/lib/history'
import { commonsFlagUrl } from '@/lib/history'
import { useT } from '@/i18n'

interface Props {
  entity: HistoricalEntity
  year: number
  onClose: () => void
}

export function HistoricalPreview({ entity, year, onClose }: Props) {
  const t = useT()
  return (
    <article className="px-6 pb-6 pt-5">
      <header className="flex items-start gap-4">
        {entity.flagFile ? (
          <img src={commonsFlagUrl(entity.flagFile)} alt={t('history.flagOf', { name: entity.name })} className="h-[45px] w-[60px] shrink-0 rounded object-contain ring-1 ring-white/15" />
        ) : (
          <div className="flex h-[45px] w-[60px] shrink-0 items-center justify-center rounded border border-border text-[10px] text-muted-foreground">{t('history.noFlag')}</div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-[30px] leading-[1.05]">{entity.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('history.asOf', { year })}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t('explore.close')} className="rounded-full p-1 hover:bg-white/10"><X className="size-4" /></button>
      </header>
      {entity.capital && <p className="mt-5 text-sm"><span className="eyebrow mr-2">{t('compare.capital')}</span>{entity.capital}</p>}
      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{t('history.sourceNote')}</p>
      <a href="https://icr.ethz.ch/data/cshapes/" target="_blank" rel="noreferrer" className="mt-2 block text-xs text-primary hover:underline">CShapes 2.0 ↗</a>
      {entity.flagFile && <a href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(entity.flagFile.replace(/ /g, '_'))}`} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-primary hover:underline">{t('history.flagSource')} ↗</a>}
    </article>
  )
}
