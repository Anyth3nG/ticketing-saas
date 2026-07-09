import { ClerkProvider, useAuth, SignIn } from '@clerk/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import TicketListPage from './pages/TicketListPage.jsx'
import CreateTicketPage from './pages/CreateTicketPage.jsx'
import TicketDetailPage from './pages/TicketDetailPage.jsx'

function ProtectedRoute() {
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) return <p>Loading...</p>
  if (!isSignedIn) return <Navigate to="/sign-in" replace />

  return <Outlet />
}

function SignInPage() {
  return (
    <div className="sign-in-page">
      <SignIn />
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
      <BrowserRouter>
        <Routes>
          <Route path="/sign-in/*" element={<SignInPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<App />}>
              <Route path="/" element={<Navigate to="/tickets" replace />} />
              <Route path="/tickets" element={<TicketListPage />} />
              <Route path="/tickets/new" element={<CreateTicketPage />} />
              <Route path="/tickets/:id" element={<TicketDetailPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </ClerkProvider>
  </StrictMode>,
)
