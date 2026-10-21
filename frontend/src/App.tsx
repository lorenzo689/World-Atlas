import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import { CountriesProvider } from '@/hooks/useCountries'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { useDocumentMeta } from '@/hooks/useMisc'
import { restoreSession } from '@/lib/api'
import { Notifications } from '@/components/layout/Notifications'
import { useT } from '@/i18n'

const ExplorerPage = lazy(() => import('@/pages/ExplorerPage'))
const LandingPage = lazy(() => import('@/pages/LandingPage'))
const ScenarioPage = lazy(() => import('@/pages/ScenarioPage'))
const CountryPage = lazy(() => import('@/pages/CountryPage'))
// full-stack features (need the Spring Boot backend)
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const QuizPage = lazy(() => import('@/pages/QuizPage'))
const MultiplayerPage = lazy(() => import('@/pages/MultiplayerPage'))
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage'))
const AtlasPage = lazy(() => import('@/pages/AtlasPage'))
const DataPage = lazy(() => import('@/pages/DataPage'))
const AchievementsPage = lazy(() => import('@/pages/AchievementsPage'))
const ChallengePage = lazy(() => import('@/pages/ChallengePage'))
const ComparePage = lazy(() => import('@/pages/ComparePage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))
const VerifyEmailPage = lazy(() => import('@/pages/AccountLinkPages').then((m) => ({ default: m.VerifyEmailPage })))
const ResetPasswordPage = lazy(() => import('@/pages/AccountLinkPages').then((m) => ({ default: m.ResetPasswordPage })))
const SharedViewPage = lazy(() => import('@/pages/SharedViewPage'))

function NotFound() {
  const t = useT()
  useDocumentMeta({ title: `${t('notfound.title')} · World Explorer`, description: t('notfound.text') })
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-serif text-6xl">{t('notfound.title')}</p>
      <p className="text-muted-foreground">{t('notfound.text')}</p>
      <Button asChild variant="outline">
        <Link to="/">{t('notfound.back')}</Link>
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

function HomeRoute() {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  const opensMap = ['year', 'compare', 'ww1', 'ww2', 'debug'].some((key) => params.has(key))
  return opensMap ? <ExplorerPage /> : <LandingPage />
}

export default function App() {
  const staticDemo = import.meta.env.VITE_STATIC_DEMO === 'true'
  useEffect(() => {
    if (!staticDemo) void restoreSession()
  }, [staticDemo])
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <TooltipProvider delayDuration={200}>
        <CountriesProvider>
          <Suspense fallback={<Splash />}>
            <Routes>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/scenarios" element={<ScenarioPage />} />
              <Route path="/explore" element={<ExplorerPage />} />
              {!staticDemo && <Route path="/countries/:code/:tab?" element={<CountryPage />} />}
              {!staticDemo && <Route path="/login" element={<LoginPage />} />}
              {!staticDemo && <Route path="/quiz" element={<QuizPage />} />}
              {!staticDemo && <Route path="/play/:code?" element={<MultiplayerPage />} />}
              {!staticDemo && <Route path="/leaderboard" element={<LeaderboardPage />} />}
              {!staticDemo && <Route path="/atlas" element={<AtlasPage />} />}
              {!staticDemo && <Route path="/data" element={<DataPage />} />}
              {!staticDemo && <Route path="/achievements" element={<AchievementsPage />} />}
              {!staticDemo && <Route path="/challenge/:slug" element={<ChallengePage />} />}
              {!staticDemo && <Route path="/compare" element={<ComparePage />} />}
              {!staticDemo && <Route path="/admin" element={<AdminPage />} />}
              {!staticDemo && <Route path="/verify" element={<VerifyEmailPage />} />}
              {!staticDemo && <Route path="/reset-password" element={<ResetPasswordPage />} />}
              {!staticDemo && <Route path="/views/:slug" element={<SharedViewPage />} />}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <Notifications />
        </CountriesProvider>
      </TooltipProvider>
    </BrowserRouter>
  )
}
