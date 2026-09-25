import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router'
import { FullPageSpinner } from '@/components/ui'
import { safeNext } from '@/lib/redirect'
import { useAuth } from './useAuth'

/** Protects app routes; unauthenticated users go to `/login?next=<current path>`. */
export function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner label="Loading your workspace" />
  if (!session) {
    const current = `${location.pathname}${location.search}${location.hash}`
    const to = current === '/' ? '/login' : `/login?next=${encodeURIComponent(current)}`
    return <Navigate to={to} replace />
  }
  return <Outlet />
}

/** Auth pages (login, sign up, …): signed-in users are sent on to `next` or the dashboard. */
export function PublicOnly() {
  const { session, loading } = useAuth()
  const [params] = useSearchParams()

  if (loading) return <FullPageSpinner label="Loading" />
  if (session) return <Navigate to={safeNext(params.get('next'))} replace />
  return <Outlet />
}
