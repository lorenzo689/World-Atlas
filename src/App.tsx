import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { CountriesProvider } from '@/hooks/useCountries'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { useDocumentMeta } from '@/hooks/useMisc'

const ExplorerPage = lazy(() => import('@/pages/ExplorerPage'))
const CountryPage = lazy(() => import('@/pages/CountryPage'))

function NotFound() {
  useDocumentMeta({ title: 'Page not found · World Explorer', description: 'This page does not exist.' })
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-serif text-6xl">Off the map</p>
      <p className="text-muted-foreground">We couldn’t find that page.</p>
      <Button asChild variant="outline">
        <Link to="/">Back to the globe</Link>
      </Button>
    </div>
  )
}

function Splash() {
  return (
    <div className="flex h-full items-center justify-center" role="status" aria-label="Loading">
      <div className="size-8 animate-spin rounded-full border border-primary/20 border-t-primary" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <TooltipProvider delayDuration={200}>
        <CountriesProvider>
          <Suspense fallback={<Splash />}>
            <Routes>
              <Route path="/" element={<ExplorerPage />} />
              <Route path="/countries/:code/:tab?" element={<CountryPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </CountriesProvider>
      </TooltipProvider>
    </BrowserRouter>
  )
}
