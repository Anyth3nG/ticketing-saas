import { ClerkProvider, useAuth, SignIn } from '@clerk/react'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import WorkerDashboard from './pages/WorkerDashboard.jsx'
import ManagerDashboard from './pages/ManagerDashboard.jsx'
import Archive from './pages/Archive.jsx'
import { getCurrentUser } from './api/users.js'

function ProtectedRoute() {
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) return <p>Loading...</p>
  if (!isSignedIn) return <Navigate to="/sign-in" replace />

  return <Outlet />
}

function SignInPage() {
  return (
    <div className="sign-in-page">
      <SignIn fallbackRedirectUrl="/" />
    </div>
  )
}

function RoleRedirect() {
  const { getToken } = useAuth()
  const [target, setTarget] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const token = await getToken()
      const user = await getCurrentUser(token)
      if (!cancelled) setTarget(user.role === 'manager' ? '/manager' : '/worker')
    }

    load()
    return () => {
      cancelled = true
    }
  }, [getToken])

  if (!target) return <p>Loading...</p>
  return <Navigate to={target} replace />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      appearance={{
        layout: {
          logoImageUrl: '/logo_mark.svg',
          logoPlacement: 'inside',
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/sign-in/*" element={<SignInPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<App />}>
              <Route path="/" element={<RoleRedirect />} />
              <Route path="/worker" element={<WorkerDashboard />} />
              <Route path="/manager" element={<ManagerDashboard />} />
              <Route path="/archive" element={<Archive />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </ClerkProvider>
  </StrictMode>,
)
