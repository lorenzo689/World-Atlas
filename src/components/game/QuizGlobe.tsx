import { lazy, Suspense, useMemo } from 'react'
import { useBoundaries } from '@/hooks/useBoundaries'
import { useCountries } from '@/hooks/useCountries'
import { INDICATORS } from '@/lib/indicators'

const GlobeView = lazy(() => import('@/components/globe/GlobeView').then((m) => ({ default: m.GlobeView })))

const NO_INSETS = { right: 0, bottom: 0 }
const noop = () => {}

/**
 * The globe for "find the country" questions: political colours, no name tooltips, and clicks become
 * answers. `highlight` marks a country (the player's click, then the correct answer) and flies there.
 */
export function QuizGlobe({
  onPick,
  highlight,
  disabled,
  className,
}: {
  onPick: (code: string) => void
  highlight: string | null
  disabled?: boolean
  className?: string
}) {
  const boundaries = useBoundaries()
  const { byCode, status } = useCountries()
  const pick = useMemo(() => (disabled ? noop : onPick), [disabled, onPick])

  return (
    <div className={className} style={{ position: 'relative', overflow: 'hidden' }}>
      {boundaries.status === 'success' && status === 'ready' ? (
        <Suspense fallback={<div className="skeleton absolute inset-0" />}>
          <GlobeView
            boundaries={boundaries.data}
            countries={byCode}
            mode="political"
            values={null}
            metric={INDICATORS.population}
            selected={highlight}
            onSelect={pick}
            onReady={noop}
            onPoseChange={noop}
            initialPose={{ lat: 20, lng: 10, altitude: 2.4 }}
            insets={NO_INSETS}
            tooltips={false}
          />
        </Suspense>
      ) : (
        <div className="skeleton absolute inset-0" />
      )}
    </div>
  )
}
