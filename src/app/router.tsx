import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { createBrowserRouter, createHashRouter, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { navPermissions } from '@/config/navigation'
import { Skeleton } from '@/components/ui/misc'
import { AccessDenied, RequireAuth, RequirePermission } from '@/auth/guards'

const page = (loader: () => Promise<{ default: ComponentType }>) => {
  const C = lazy(loader)
  return <C />
}

function PageFallback() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading page">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-80" />
    </div>
  )
}

/** Route protected by the same permission list that drives the navigation item `navKey`. */
const gated = (navKey: string, el: ReactNode, extra: string[] = []) => (
  <RequirePermission anyOf={[...navPermissions(navKey), ...extra]}>
    <Suspense fallback={<PageFallback />}>{el}</Suspense>
  </RequirePermission>
)
/** Route protected by an explicit permission list. */
const needs = (perms: string[], el: ReactNode) => (
  <RequirePermission anyOf={perms}>
    <Suspense fallback={<PageFallback />}>{el}</Suspense>
  </RequirePermission>
)

const open = (el: ReactNode) => <Suspense fallback={<div className="p-10"><PageFallback /></div>}>{el}</Suspense>

/** Old URLs keep working. */
function Redirect({ to }: { to: (p: Record<string, string | undefined>) => string }) {
  const params = useParams()
  return <Navigate to={to(params)} replace />
}
function LegacyStatusRedirect() {
  const { ref } = useParams()
  const [sp] = useSearchParams()
  const q = new URLSearchParams({ ref: ref ?? '' })
  if (sp.get('token')) q.set('token', sp.get('token')!)
  return <Navigate to={`/track?${q.toString()}`} replace />
}

/** The standalone single-file build uses hash URLs so it works when opened from disk. */
const createRouter = import.meta.env.VITE_SINGLE_FILE === 'true' ? createHashRouter : createBrowserRouter

export const router = createRouter([
  { path: '/', element: open(page(() => import('@/pages/public/LandingPage'))) },
  { path: '/login', element: open(page(() => import('@/pages/public/LoginPage'))) },
  { path: '/sign-in', element: <Navigate to="/login" replace /> },
  { path: '/register', element: open(page(() => import('@/pages/public/RegisterPage'))) },
  { path: '/track', element: open(page(() => import('@/pages/public/TrackApplicationPage'))) },
  { path: '/forgot-password', element: open(page(() => import('@/pages/public/PasswordResetPages').then((m) => ({ default: m.ForgotPasswordPage })))) },
  { path: '/reset-password', element: open(page(() => import('@/pages/public/PasswordResetPages').then((m) => ({ default: m.ResetPasswordPage })))) },
  { path: '/status/:ref', element: <LegacyStatusRedirect /> },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: gated('overview', page(() => import('@/pages/dashboard/OverviewPage'))) },
      { path: 'tasks', element: gated('tasks', page(() => import('@/pages/workspace/TasksPage'))) },
      { path: 'notifications', element: gated('notifications', page(() => import('@/pages/workspace/NotificationsPage'))) },

      // Customer onboarding
      { path: 'my-applications', element: gated('my-applications', page(() => import('@/pages/applications/MyApplicationsPage'))) },
      { path: 'my-applications/:id', element: gated('my-applications', page(() => import('@/pages/applications/MyApplicationDetailPage'))) },
      { path: 'my-applications/:id/edit', element: needs(['application.edit_own'], page(() => import('@/pages/applications/EditApplicationPage'))) },
      { path: 'applications', element: gated('applications', page(() => import('@/pages/applications/ApplicationsQueuePage'))) },
      { path: 'applications/:id', element: gated('applications', page(() => import('@/pages/applications/ApplicationDetailPage'))) },
      { path: 'my-application', element: <Navigate to="/app/my-applications" replace /> },

      // Customer portal & customer management
      { path: 'account', element: gated('account', page(() => import('@/pages/customers/CustomerAccountPage'))) },
      { path: 'activities', element: gated('activities', page(() => import('@/pages/customers/ActivitiesPage'))) },
      { path: 'performance', element: gated('performance', page(() => import('@/pages/customers/TerritoryPerformancePage'))) },
      { path: 'customers', element: gated('customers', page(() => import('@/pages/customers/CustomersPage'))) },
      { path: 'customers/:id', element: gated('customers', page(() => import('@/pages/customers/CustomerDetailPage')), ['customer.view_own']) },
      { path: 'customers/applications/:id', element: <Redirect to={(p) => `/app/applications/${p.id}`} /> },
      { path: 'distributors', element: <Navigate to="/app/customers" replace /> },
      { path: 'distributors/:id', element: <Redirect to={(p) => `/app/customers/${p.id}`} /> },

      { path: 'catalog', element: gated('catalog', page(() => import('@/pages/catalog/CatalogPage'))) },
      { path: 'requests', element: gated('requests', page(() => import('@/pages/orders/RequestsPage'))) },
      { path: 'requests/new', element: needs(['order.create', 'order.create_on_behalf'], page(() => import('@/pages/orders/RequestWizardPage'))) },
      { path: 'requests/:id', element: gated('orders', page(() => import('@/pages/orders/RequestDetailPage'))) },
      { path: 'orders', element: gated('orders', page(() => import('@/pages/sap/SalesOrdersPage'))) },
      { path: 'orders/:so', element: gated('orders', page(() => import('@/pages/sap/SalesOrderDetailPage'))) },
      { path: 'deliveries', element: gated('deliveries', page(() => import('@/pages/sap/DeliveriesPage'))) },
      { path: 'deliveries/:dn', element: gated('deliveries', page(() => import('@/pages/sap/DeliveryDetailPage'))) },
      { path: 'finance/invoices', element: gated('sap-invoices', page(() => import('@/pages/sap/SapInvoicesPage'))) },
      { path: 'finance/open-invoices', element: gated('open-invoices', page(() => import('@/pages/sap/OpenInvoicesPage'))) },
      { path: 'finance/invoices/:inv', element: gated('sap-invoices', page(() => import('@/pages/sap/SapInvoiceDetailPage'))) },
      { path: 'finance/outstanding', element: gated('outstanding', page(() => import('@/pages/sap/OutstandingPage'))) },
      { path: 'finance/aging', element: gated('aging', page(() => import('@/pages/sap/AgingPage'))) },
      { path: 'finance/ledger', element: gated('ledger', page(() => import('@/pages/sap/LedgerPage'))) },
      { path: 'finance/payments', element: gated('sap-payments', page(() => import('@/pages/sap/SapPaymentsPage'))) },
      { path: 'finance/payments/:doc', element: gated('sap-payments', page(() => import('@/pages/sap/SapPaymentDetailPage'))) },
      { path: 'approvals', element: gated('approvals', page(() => import('@/pages/approvals/ApprovalWorkbenchPage'))) },
      { path: 'approvals/:id', element: gated('approvals', page(() => import('@/pages/orders/RequestDetailPage'))) },
      { path: 'invoices', element: gated('invoices', page(() => import('@/pages/finance/InvoicesPage'))) },
      { path: 'invoices/:id', element: gated('invoices', page(() => import('@/pages/finance/InvoiceDetailPage'))) },
      { path: 'payments', element: gated('payments', page(() => import('@/pages/finance/PaymentsPage'))) },
      { path: 'shipments', element: gated('shipments', page(() => import('@/pages/logistics/ShipmentsPage'))) },
      { path: 'shipments/:id', element: gated('shipments', page(() => import('@/pages/logistics/ShipmentDetailPage'))) },
      { path: 'collection', element: gated('collection', page(() => import('@/pages/logistics/CollectionPage'))) },
      { path: 'documents', element: gated('documents', page(() => import('@/pages/logistics/DocumentsPage'))) },
      { path: 'email', element: gated('email', page(() => import('@/pages/communications/EmailPage'))) },
      { path: 'follow-ups', element: gated('followups', page(() => import('@/pages/communications/FollowUpsPage'))) },

      // Administration
      { path: 'admin/users', element: gated('users', page(() => import('@/pages/administration/UsersPage'))) },
      { path: 'admin/roles', element: gated('roles', page(() => import('@/pages/administration/RolesPage'))) },
      { path: 'admin/authorization', element: gated('authorization', page(() => import('@/pages/administration/AuthorizationMatrixPage'))) },
      { path: 'admin/territories', element: gated('territories', page(() => import('@/pages/administration/TerritoriesPage'))) },
      { path: 'admin/workflow', element: gated('workflow', page(() => import('@/pages/administration/WorkflowRulesPage'))) },
      { path: 'admin/integration', element: gated('integration', page(() => import('@/pages/administration/IntegrationMonitorPage'))) },
      { path: 'admin/audit', element: gated('audit', page(() => import('@/pages/administration/AuditTrailPage'))) },

      { path: 'change-password', element: open(page(() => import('@/pages/public/PasswordResetPages').then((m) => ({ default: m.ChangePasswordPage })))) },
      { path: 'no-access', element: <AccessDenied title="No modules are assigned to your account" description="Your account is signed in but has no permissions yet. Ask your System Administrator to assign a role." /> },
      { path: '*', element: open(page(() => import('@/pages/NotFoundPage'))) },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
