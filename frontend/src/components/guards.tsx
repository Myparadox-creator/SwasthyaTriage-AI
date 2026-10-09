import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { homeForRole, useAuthStore, type AuthUser, type Role } from '../stores/auth'

export function ProtectedRoute() {
  const status = useAuthStore((s) => s.status)
  const initialize = useAuthStore((s) => s.initialize)
  const location = useLocation()

  useEffect(() => {
    if (status === 'idle') void initialize()
  }, [status, initialize])

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }
  if (status !== 'authenticated') {
    return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />
  }
  return <Outlet />
}

export function RequireRole({ roles }: { roles: Role[] }) {
  const user = useAuthStore((s) => s.user) as AuthUser | null
  const location = useLocation()
  if (!user) return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />
  if (!roles.includes(user.role)) {
    return <Navigate to={homeForRole(user.role)} replace />
  }
  return <Outlet />
}

export function GuestOnly() {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const initialize = useAuthStore((s) => s.initialize)
  const location = useLocation()

  useEffect(() => {
    if (status === 'idle') void initialize()
  }, [status, initialize])

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-teal-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 rounded-full border-2 border-teal-500/30 border-t-teal-400 animate-spin" />
          <span className="text-xs text-slate-400">Loading portal…</span>
        </div>
      </div>
    )
  }
  // If already authenticated, allow /auth/login to render so the user can see login,
  // switch roles, or continue to their dashboard, but redirect other auth sub-routes (e.g. signup, forgot-password).
  if (status === 'authenticated' && user && location.pathname !== '/auth/login') {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? homeForRole(user.role)} replace />
  }
  return <Outlet />
}