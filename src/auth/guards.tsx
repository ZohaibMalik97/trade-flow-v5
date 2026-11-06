/**
 * Route and element guards.
 * They keep unauthorised pages and actions out of the UI — including pages opened by typing a URL —
 * but they are NOT a security boundary: the API enforces the same permissions on every request.
 */
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'
import { useStore } from '@/app/store'
import { EmptyState } from '@/components/ui/misc'
import { ButtonLink } from '@/components/ui/Button'
import { landingPathFor } from '@/config/navigation'

/** Redirects anonymous visitors to the sign-in page, remembering where they wanted to go. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, restoring, state } = useStore()
  const location = useLocation()
  // While the session is restored from the refresh cookie (or data is loading), show a neutral loading state.
  if (restoring || (isAuthenticated && !state.loaded))
    return <div role="status" aria-label="Loading" className="flex min-h-dvh items-center justify-center text-sm text-muted">Loading TradeFlow…</div>
  if (!isAuthenticated) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <>{children}</>
}

/** Renders children only when the user holds at least one of the permissions; otherwise a 403 page. */
export function RequirePermission({ anyOf, children }: { anyOf: string[]; children: ReactNode }) {
  const { canAny } = useStore()
  if (anyOf.length === 0 || canAny(...anyOf)) return <>{children}</>
  return <AccessDenied />
}

/** Inline permission check for buttons and sections. */
export function Can({ anyOf, children, fallback = null }: { anyOf: string[]; children: ReactNode; fallback?: ReactNode }) {
  const { canAny } = useStore()
  return <>{canAny(...anyOf) ? children : fallback}</>
}

export function AccessDenied({ title = 'You don’t have access to this page', description }: { title?: string; description?: string }) {
  const { can } = useStore()
  return (
    <div className="card" role="alert">
      <EmptyState
        icon={<ShieldOff className="size-5" />}
        title={title}
        description={description ?? 'Your account does not have the permission required to open this page or record. If you believe this is a mistake, contact your System Administrator.'}
        action={<ButtonLink to={landingPathFor(can)}>Go to my home page</ButtonLink>}
      />
      <p className="pb-6 text-center text-[11px] text-muted">Error 403 · access denied</p>
    </div>
  )
}
