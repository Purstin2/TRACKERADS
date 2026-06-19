import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/layout/AppShell'

const DashboardPage = lazy(() => import('./modules/dashboard/DashboardPage'))
const MonitorPage = lazy(() => import('./modules/monitor/MonitorPage'))
const TrackerPage = lazy(() => import('./modules/tracker/TrackerPage'))
const UploaderPage = lazy(() => import('./modules/uploader/UploaderPage'))
const PixelPage = lazy(() => import('./modules/pixel/PixelPage'))
const MobileApp = lazy(() => import('./modules/mobile/MobileApp'))

function Loading() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand" />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      {/* App mobile instalável (PWA) — tela cheia, sem sidebar */}
      <Route
        path="/app"
        element={
          <Suspense fallback={<Loading />}>
            <MobileApp />
          </Suspense>
        }
      />
      <Route element={<AppShell />}>
        <Route
          index
          element={
            <Suspense fallback={<Loading />}>
              <DashboardPage />
            </Suspense>
          }
        />
        <Route
          path="monitor/*"
          element={
            <Suspense fallback={<Loading />}>
              <MonitorPage />
            </Suspense>
          }
        />
        <Route
          path="tracker/*"
          element={
            <Suspense fallback={<Loading />}>
              <TrackerPage />
            </Suspense>
          }
        />
        <Route
          path="uploader/*"
          element={
            <Suspense fallback={<Loading />}>
              <UploaderPage />
            </Suspense>
          }
        />
        <Route
          path="pixel/*"
          element={
            <Suspense fallback={<Loading />}>
              <PixelPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
