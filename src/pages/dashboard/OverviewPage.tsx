import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileCheck2,
  GitBranch,
  PackageCheck,
  Plus,
  Receipt,
  Timer,
  Undo2,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react'
import { requestTotal, useLookups, useStore } from '@/app/store'
import { useScope, useTasks } from '@/hooks/useScope'
import { useSimulatedLoading } from '@/hooks/misc'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatCard } from '@/components/data-display/StatCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { ButtonLink } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Avatar, ProgressBar, Skeleton } from '@/components/ui/misc'
import { ActivityTimeline } from '@/components/data-display/Timeline'
import { ACTION_LABEL, stageById } from '@/workflow/engine'
import { toUsd } from '@/utils/fx'
import { date, hoursBetween, money, num, relative } from '@/utils/format'
import { cn } from '@/utils/cn'
import { CustomerDashboard } from './CustomerDashboard'
import { CHART, ChartCard, Donut, monthlyTotals, RequestList, SimpleBars, TrendArea } from './widgets'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function OverviewPage() {
  const { user, state, can, canAny } = useStore()
  const lookups = useLookups()
  const loading = useSimulatedLoading(500, user.id)
  const firstName = user.name.split(' ')[0]
  const roles = user.roleIds.map((r) => lookups.role(r)?.name ?? r).join(' · ')

  const actions =
    canAny('order.create', 'order.create_on_behalf') ? (
      <>
        <ButtonLink to="/app/catalog" variant="secondary" icon={<BookOpen className="size-4" />}>Browse catalog</ButtonLink>
        <ButtonLink to="/app/requests/new" icon={<Plus className="size-4" />}>Create request</ButtonLink>
      </>
    ) : canAny('order.approve') ? (
      <ButtonLink to="/app/approvals" icon={<GitBranch className="size-4" />}>Request approvals</ButtonLink>
    ) : can('application.view_own') && !user.customerId ? (
      <ButtonLink to="/app/my-applications" icon={<BadgeCheck className="size-4" />}>My applications</ButtonLink>
    ) : null

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={`${date(new Date().toISOString(), 'long')} · ${roles || 'No role assigned'}${user.customerId ? ` · ${state.customers.find((c) => c.id === user.customerId)?.name ?? ''}` : ''}`}
        actions={actions}
      />
      {loading ? <DashboardSkeleton /> : (
        <div className="space-y-4">
          <SapQueueNotice />
          <ApplicationWidgets />
          <PermissionDashboard />
        </div>
      )}
    </>
  )
}

/** Internally approved requests not yet in SAP — for users who may submit them. */
function SapQueueNotice() {
  const { can } = useStore()
  const scope = useScope()
  if (!can('order.sap_submit')) return null
  const q = scope.requests.filter((r) => r.status === 'Approved' && r.sap && !r.sap.documentNumber)
  if (!q.length) return null
  const failed = q.filter((r) => r.sap?.status === 'SAP Creation Failed').length
  return (
    <div role="status" className={cn('flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 text-[13px]', failed ? 'border-danger/30 bg-danger-50 text-danger-700' : 'border-warning/30 bg-warning-50 text-warning-700')}>
      <AlertTriangle className="size-4 shrink-0" />
      <span className="flex-1"><strong>{q.length}</strong> approved request(s) not yet in SAP{failed ? ` · ${failed} failed submission(s) to retry` : ''}.</span>
      <Link to="/app/approvals?tab=sap" className="font-medium underline-offset-2 hover:underline">Review SAP queue</Link>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-lg" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-80 rounded-lg xl:col-span-2" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
    </div>
  )
}

/**
 * The main dashboard is composed from permissions (not role names). Users with
 * several roles get the panel of their most operational capability.
 */
function PermissionDashboard() {
  const { user, can } = useStore()
  if (user.kind === 'external' && user.customerId && can('order.view_own')) return <CustomerDashboard />
  if (can('performance.view_all') && can('order.approve')) return <HeadOfSalesDashboard />
  if (can('performance.view_assigned') && can('order.approve')) return <TerritoryManagerDashboard />
  if (can('payment.verify') && can('shipment.update'))
    return (
      <div className="space-y-4">
        <FinanceDashboard />
        <LogisticsDashboard />
      </div>
    )
  if (can('order.create_on_behalf')) return <CoordinatorDashboard />
  if (can('order.approve')) return <ApproverDashboard />
  if (can('payment.verify')) return <FinanceDashboard />
  if (can('shipment.update')) return <LogisticsDashboard />
  if (can('user.manage') || can('audit.view')) return <AdminDashboard />
  if (can('application.view_own')) return null
  return <TaskPanel />
}

// ─── Customer applications (personalised, scope-limited) ──────────────

function ApplicationWidgets() {
  const { state, can, user } = useStore()
  const scope = useScope()
  const lookups = useLookups()
  const reviewer = can('application.view_assigned') || can('application.view_all')
  // Existing customers only see this block while one of their own registrations is still open.
  const own = can('application.view_own') && scope.myApplications.some((a) => !user.customerId || !['Approved', 'Rejected'].includes(a.status))
  const applicantOnly = can('application.view_own') && !user.customerId
  if (!reviewer && !own && !applicantOnly) return null

  const stageKind = (id?: string) => stageById(state.onboardingWorkflow, id)?.kind
  const pendingReview = scope.applicationQueue.filter((a) => stageKind(a.currentStageId) === 'review')
  const awaitingApproval = scope.applicationQueue.filter((a) => stageKind(a.currentStageId) === 'approval')
  const returnedMine = scope.myApplications.filter((a) => a.status === 'Returned for Information')
  const handled = (a: (typeof scope.applications)[number]) => a.history.some((e) => e.actorId === user.id)
  const decidedScope = reviewer ? scope.applications.filter((a) => can('application.view_all') || handled(a)) : scope.myApplications
  const approved = decidedScope.filter((a) => a.status === 'Approved')
  const rejected = decidedScope.filter((a) => a.status === 'Rejected')
  const internal = can('application.view_internal')
  const stageLabel = (id?: string) => stageById(state.onboardingWorkflow, id)?.publicLabel ?? 'Review'
  /** Applicant-facing wording (no internal stage names or reviewer identities). */
  const applicantLabel = (e: (typeof scope.applications)[number]['history'][number]) =>
    e.action === 'approve' ? (e.toStatus === 'Approved' ? 'Registration approved' : `${stageLabel(e.fromStageId)} completed`) : e.action === 'start_review' ? `${stageLabel(e.toStageId)} started` : ACTION_LABEL[e.action]
  const source = reviewer ? scope.applications : scope.myApplications
  const activity = source
    .flatMap((a) => a.history.filter((e) => (internal || e.visibility === 'public') && e.action !== 'assign').map((e, i) => ({ e, a, i })))
    .sort((x, y) => y.e.at.localeCompare(x.e.at) || y.i - x.i)
    .slice(0, 6)

  return (
    <section aria-labelledby="apps-heading" className="space-y-4">
      <h2 id="apps-heading" className="text-[15px] font-semibold">Customer applications</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(own || applicantOnly) && (
          <StatCard label="My applications" value={scope.myApplications.length} icon={<BadgeCheck className="size-4" />} hint={`${scope.myApplications.filter((a) => !['Approved', 'Rejected', 'Draft'].includes(a.status)).length} in progress`} to="/app/my-applications" />
        )}
        {(own || applicantOnly) && (
          <StatCard label="Returned for information" value={returnedMine.length} icon={<Undo2 className="size-4" />} tone={returnedMine.length ? 'warning' : 'success'} hint={returnedMine.length ? 'Your action is required' : 'Nothing to correct'} to="/app/my-applications" />
        )}
        {reviewer && can('application.review') && (
          <StatCard label="Pending my review" value={pendingReview.length} icon={<FileCheck2 className="size-4" />} tone={pendingReview.length ? 'warning' : 'success'} hint="Initial review stage" to="/app/applications?tab=action" />
        )}
        {reviewer && can('application.approve') && (
          <StatCard label="Applications awaiting my approval" value={awaitingApproval.length} icon={<GitBranch className="size-4" />} tone={awaitingApproval.length ? 'warning' : 'success'} hint="Approval stages assigned to you" to="/app/applications?tab=action" />
        )}
        {reviewer && (
          <StatCard label="Requiring my action" value={scope.applicationQueue.length} icon={<Timer className="size-4" />} tone="primary" hint="All stages" to="/app/applications?tab=action" />
        )}
        <StatCard label={reviewer && !can('application.view_all') ? 'Approved (handled by me)' : 'Approved'} value={approved.length} icon={<CheckCircle2 className="size-4" />} tone="success" hint={`${rejected.length} rejected`} to={reviewer ? '/app/applications?tab=approved' : '/app/my-applications'} />
      </div>
      {(activity.length > 0 || reviewer) && (
        <Card>
          <CardHeader title="Recent workflow activity" description={reviewer ? 'Applications in your scope' : 'Your applications'} actions={<Link to={reviewer ? '/app/applications' : '/app/my-applications'} className="text-[13px] font-medium text-primary hover:underline">Open</Link>} />
          <ul className="divide-y divide-line">
            {activity.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-muted">No activity yet.</li>}
            {activity.map(({ e, a }) => (
              <li key={e.id}>
                <Link to={a.applicantUserId === user.id ? `/app/my-applications/${a.id}` : `/app/applications/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas">
                  <Avatar name={a.companyName || a.ref} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{reviewer ? ACTION_LABEL[e.action] : applicantLabel(e)} · {a.ref}</span>
                    <span className="block truncate text-xs text-muted">
                      {a.companyName}
                      {reviewer && e.actorId !== 'system' ? ` · ${lookups.user(e.actorId)?.name ?? ''}` : ''} · {relative(e.at)}
                    </span>
                  </span>
                  <StatusBadge status={e.toStatus} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}


function TaskPanel({ limit = 5 }: { limit?: number }) {
  const tasks = useTasks()
  return (
    <Card>
      <CardHeader title="My tasks" description={`${tasks.length} open`} actions={<Link to="/app/tasks" className="text-[13px] font-medium text-primary hover:underline">All tasks</Link>} />
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center px-5 py-10 text-center">
          <CheckCircle2 className="size-8 text-success" />
          <p className="mt-2 text-[13px] font-medium">Nothing waiting on you</p>
          <p className="text-xs text-muted">New tasks appear here as work moves to your role.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {tasks.slice(0, limit).map((t) => (
            <li key={t.id}>
              <Link to={t.link} className="flex items-start gap-3 px-5 py-3 hover:bg-canvas">
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', t.priority === 'high' ? 'bg-danger' : t.priority === 'medium' ? 'bg-warning' : 'bg-slate-300')} aria-label={`${t.priority} priority`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{t.title}</span>
                  <span className="block truncate text-xs text-muted">{t.description}</span>
                </span>
                <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ─── Customer ──────────────────────────────────────────────────────────

// ─── Account Manager ──────────────────────────────────────────────

const CONFIRMED_STATUSES = ['Approved', 'Awaiting Payment', 'Payment Verified', 'In Fulfillment', 'Ready for Collection', 'Collected']

function TerritoryManagerDashboard() {
  const scope = useScope()
  const { state, user } = useStore()
  const lookups = useLookups()
  const terrs = state.territories.filter((t) => scope.territoryIds.has(t.id))
  const since = Date.now() - 90 * 86_400_000
  const confirmed = scope.requests.filter((r) => CONFIRMED_STATUSES.includes(r.status) && new Date(r.createdAt).getTime() > since)
  const value = confirmed.reduce((s, r) => s + toUsd(requestTotal(r), r.currency), 0)
  const planned = scope.activities.filter((a) => a.status === 'Planned' && a.ownerId === user.id).sort((a, b) => a.at.localeCompare(b.at))
  const territoryApps = scope.applications.filter((a) => terrs.some((t) => t.id === a.territoryId) && !['Approved', 'Rejected'].includes(a.status))
  const quiet = scope.customers.filter((c) => !scope.activities.some((a) => a.customerId === c.id && a.status === 'Completed' && new Date(a.at).getTime() > Date.now() - 30 * 86_400_000))
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="My customers" value={scope.customers.length} icon={<Users className="size-4" />} hint={terrs.map((t) => t.name).join(' · ')} to="/app/customers" />
        <StatCard label="Orders awaiting my approval" value={scope.approvalQueue.length} icon={<GitBranch className="size-4" />} tone="warning" to="/app/approvals" hint="Sales order requests" />
        <StatCard label="Confirmed value (90 days)" value={money(value, 'USD', { compact: true })} icon={<Receipt className="size-4" />} tone="success" hint={`${confirmed.length} orders · USD equiv.`} to="/app/performance" />
        <StatCard label="Planned visits & follow-ups" value={planned.length} icon={<CalendarClock className="size-4" />} tone="neutral" hint={`${planned.filter((a) => new Date(a.at).getTime() < Date.now()).length} overdue`} to="/app/activities" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RequestList requests={scope.approvalQueue} title="Approval queue" description={`Scope: ${terrs.map((t) => t.name).join(', ')}`} to="/app/approvals" empty="Queue is clear." showSla />
        </div>
        <Card>
          <CardHeader title="Upcoming visits & follow-ups" actions={<Link to="/app/activities" className="text-[13px] font-medium text-primary hover:underline">All</Link>} />
          <ul className="divide-y divide-line">
            {planned.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-muted">Nothing planned.</li>}
            {planned.slice(0, 5).map((a) => (
              <li key={a.id}>
                <Link to={`/app/customers/${a.customerId}?tab=activities`} className="block px-5 py-3 hover:bg-canvas">
                  <span className="block text-[13px] font-medium">{a.type}: {a.subject}</span>
                  <span className={cn('block text-xs', new Date(a.at).getTime() < Date.now() ? 'text-danger-700' : 'text-muted')}>{lookups.customer(a.customerId)?.name} · {date(a.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Customers without a visit or call in 30 days" actions={<Link to="/app/customers" className="text-[13px] font-medium text-primary hover:underline">Customers</Link>} />
          <ul className="divide-y divide-line">
            {quiet.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-muted">Every customer had recent contact.</li>}
            {quiet.slice(0, 6).map((c) => (
              <li key={c.id}>
                <Link to={`/app/customers/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas">
                  <Avatar name={c.name} size="sm" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{c.name}</span><span className="block text-xs text-muted">{c.city} · {lookups.territory(c.territoryId)?.name}</span></span>
                  <StatusBadge status={c.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Onboarding applications in my territories" actions={<Link to="/app/applications?tab=all" className="text-[13px] font-medium text-primary hover:underline">Open</Link>} />
          <ul className="divide-y divide-line">
            {territoryApps.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-muted">No open applications.</li>}
            {territoryApps.slice(0, 6).map((a) => (
              <li key={a.id}>
                <Link to={`/app/applications/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas">
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{a.companyName}</span><span className="block text-xs text-muted">{a.ref} · {lookups.territory(a.territoryId)?.name}</span></span>
                  <StatusBadge status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

// ─── Head of Sales ───────────────────────────────────────────────────────

function HeadOfSalesDashboard() {
  const scope = useScope()
  const { state } = useStore()
  const lookups = useLookups()
  const since = Date.now() - 90 * 86_400_000
  const pending = state.requests.filter((r) => r.status === 'Pending Approval')
  const breached = pending.filter((r) => {
    const st = r.approvalSteps.find((x) => x.status === 'Pending')
    return st?.enteredAt && hoursBetween(st.enteredAt) > st.slaHours
  })
  const byTerritory = state.territories
    .map((t) => ({
      label: t.name,
      value: Math.round(state.requests.filter((r) => r.territoryId === t.id && CONFIRMED_STATUSES.includes(r.status) && new Date(r.createdAt).getTime() > since).reduce((s, r) => s + toUsd(requestTotal(r), r.currency), 0)),
    }))
    .sort((a, b) => b.value - a.value)
  const total = byTerritory.reduce((s, x) => s + x.value, 0)
  const outstanding = state.invoices.filter((i) => ['Issued', 'Receipt Uploaded'].includes(i.status)).reduce((s, i) => s + toUsd(i.total, i.currency), 0)
  const managers = [...new Set(state.territories.map((t) => t.managerId))]
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Confirmed value (90 days)" value={money(total, 'USD', { compact: true })} icon={<Receipt className="size-4" />} tone="success" hint={`${state.territories.length} territories · USD equiv.`} to="/app/performance" />
        <StatCard label="Orders awaiting my approval" value={scope.approvalQueue.length} icon={<GitBranch className="size-4" />} tone="warning" to="/app/approvals" hint={`${pending.length} requests in approval overall`} />
        <StatCard label="Approval exceptions" value={breached.length} icon={<AlertTriangle className="size-4" />} tone={breached.length ? 'danger' : 'success'} hint="Waiting longer than SLA" to="/app/approvals" />
        <StatCard label="Outstanding receivables" value={money(outstanding, 'USD', { compact: true })} icon={<Wallet className="size-4" />} tone="neutral" hint={`${scope.customers.length} customers`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Confirmed order value by territory" description="USD equivalent · last 90 days" demo={false} className="xl:col-span-2" action={<Link to="/app/performance" className="text-[13px] font-medium text-primary hover:underline">Compare</Link>}>
          <SimpleBars data={byTerritory} valueLabel="Value" currency="USD" horizontal />
        </ChartCard>
        <Card>
          <CardHeader title="Account Managers" />
          <ul className="divide-y divide-line">
            {managers.map((id) => {
              const terrs = state.territories.filter((t) => t.managerId === id)
              const acts = state.activities.filter((a) => a.ownerId === id && a.status === 'Completed' && new Date(a.at).getTime() > Date.now() - 30 * 86_400_000).length
              const queue = pending.filter((r) => r.approvalSteps.some((st) => st.status === 'Pending' && st.approverId === id)).length
              return (
                <li key={id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={lookups.user(id)?.name ?? id} size="sm" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{lookups.user(id)?.name}</span><span className="block truncate text-xs text-muted">{terrs.map((t) => t.name).join(', ')}</span></span>
                  <span className="text-right text-xs text-muted"><span className="block">{acts} activities / 30d</span><span className={cn('block', queue && 'font-medium text-warning-700')}>{queue} pending</span></span>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RequestList requests={scope.approvalQueue} title="Final approvals" description="Strategic and elevated-value orders" to="/app/approvals" empty="Nothing waiting for you." showSla />
        </div>
        <TaskPanel />
      </div>
    </div>
  )
}

// ─── Sales coordinator (optional role) ────────────────────────────────────────────────────

function CoordinatorDashboard() {
  const scope = useScope()
  const lookups = useLookups()
  const apps = scope.applicationQueue
  const inApproval = scope.requests.filter((r) => r.status === 'Pending Approval')
  const breached = inApproval.filter((r) => {
    const s = r.approvalSteps.find((x) => x.status === 'Pending')
    return s?.enteredAt && hoursBetween(s.enteredAt) > s.slaHours
  })
  const followUps = scope.threads.filter((t) => ['Overdue', 'Due Today', 'Open'].includes(t.followUp.status))
  const statusCounts = ['Draft', 'Pending Approval', 'Returned for Clarification', 'Awaiting Payment', 'In Fulfillment', 'Ready for Collection'].map((s) => ({
    label: s.replace('Ready for ', '').replace('Returned for Clarification', 'Changes'),
    value: scope.requests.filter((r) => r.status === s || (s === 'In Fulfillment' && r.status === 'Payment Verified')).length,
  }))

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Applications to review" value={apps.length} icon={<BadgeCheck className="size-4" />} hint={`${apps.filter((a) => a.status === 'Submitted' || a.status === 'Resubmitted').length} new or resubmitted`} to="/app/applications?tab=action" />
        <StatCard label="Requests in approval" value={inApproval.length} icon={<GitBranch className="size-4" />} tone="warning" to="/app/requests" hint={money(inApproval.reduce((s, r) => s + toUsd(requestTotal(r), r.currency), 0), 'USD', { compact: true }) + ' total'} />
        <StatCard label="SLA breaches" value={breached.length} icon={<AlertTriangle className="size-4" />} tone={breached.length ? 'danger' : 'success'} hint="Approval stage over SLA" to="/app/approvals" />
        <StatCard label="Follow-ups open" value={followUps.length} icon={<CalendarClock className="size-4" />} tone="neutral" hint={`${followUps.filter((t) => t.followUp.status === 'Overdue').length} overdue`} to="/app/follow-ups" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Requests by stage" description="Current pipeline across all territories" demo={false} className="xl:col-span-2">
          <SimpleBars data={statusCounts} valueLabel="Requests" />
        </ChartCard>
        <TaskPanel limit={6} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <RequestList requests={inApproval.slice(0, 5)} title="Waiting on approvers" description="Chase breached SLAs first" to="/app/approvals" empty="No requests in approval." showSla />
        <Card>
          <CardHeader title="Applications waiting for you" actions={<Link to="/app/applications" className="text-[13px] font-medium text-primary hover:underline">Review</Link>} />
          <ul className="divide-y divide-line">
            {apps.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-muted">No applications waiting for you.</li>}
            {apps.map((a) => (
              <li key={a.id}>
                <Link to={`/app/applications/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas">
                  <Avatar name={a.companyName} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{a.companyName}</span>
                    <span className="block text-xs text-muted">{a.ref} · {a.city}, {lookups.territory(a.territoryId)?.name} · {relative(a.submittedAt)}</span>
                  </span>
                  <StatusBadge status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

// ─── Approvers ────────────────────────────────────────────────────────────

function ApproverDashboard() {
  const scope = useScope()
  const { user, state } = useStore()
  const lookups = useLookups()
  const queue = scope.approvalQueue
  const breached = queue.filter((r) => {
    const s = r.approvalSteps.find((x) => x.status === 'Pending')!
    return s.enteredAt && hoursBetween(s.enteredAt) > s.slaHours
  })
  const myActions = state.requests.flatMap((r) => r.approvalSteps.filter((s) => s.actedById === user.id && s.actedAt).map((s) => ({ r, s })))
  const approved = myActions.filter((x) => x.s.status === 'Approved')
  const avgHours = myActions.length ? myActions.reduce((sum, x) => sum + hoursBetween(x.s.enteredAt!, x.s.actedAt!), 0) / myActions.length : 0
  const byTerritory = state.territories
    .filter((t) => scope.requests.some((r) => r.territoryId === t.id))
    .map((t) => ({
      label: t.name,
      value: Math.round(scope.requests.filter((r) => r.territoryId === t.id && !['Draft', 'Rejected', 'Cancelled'].includes(r.status)).reduce((s, r) => s + toUsd(requestTotal(r), r.currency), 0)),
    }))
    .sort((a, b) => b.value - a.value)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Awaiting my approval" value={queue.length} icon={<GitBranch className="size-4" />} tone="warning" to="/app/approvals" hint={money(queue.reduce((s, r) => s + toUsd(requestTotal(r), r.currency), 0), 'USD', { compact: true }) + ' in value'} />
        <StatCard label="SLA breached" value={breached.length} icon={<Timer className="size-4" />} tone={breached.length ? 'danger' : 'success'} hint={breached.length ? 'Act on these first' : 'All within SLA'} />
        <StatCard label="Approved by me" value={approved.length} icon={<CheckCircle2 className="size-4" />} tone="success" hint={money(approved.reduce((s, x) => s + toUsd(requestTotal(x.r), x.r.currency), 0), 'USD', { compact: true }) + ' approved'} />
        <StatCard label="Avg. decision time" value={`${num(avgHours, 1)}h`} icon={<Clock className="size-4" />} tone="neutral" hint="From queue entry to decision" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RequestList requests={queue} title="Approval queue" description={user.territoryIds?.length ? `Scope: ${user.territoryIds.map((t) => lookups.territory(t)?.name).join(', ')}` : user.regionId ? `Scope: ${lookups.region(user.regionId)?.name}` : 'Final approvals for strategic orders'} to="/app/approvals" empty="Queue is clear — nice work." showSla />
        </div>
        <TaskPanel />
      </div>
      <ChartCard title="Pipeline value by territory" description="USD equivalent · requests in scope (excludes drafts and rejections)" demo={false}>
        <SimpleBars data={byTerritory} valueLabel="Value" currency="USD" horizontal />
      </ChartCard>
    </div>
  )
}

// ─── Finance ──────────────────────────────────────────────────────────────

function FinanceDashboard() {
  const { state } = useStore()
  const lookups = useLookups()
  const toIssue = state.requests.filter((r) => r.status === 'Approved' && !r.invoiceId)
  const toVerify = state.payments.filter((p) => p.status === 'Receipt Uploaded')
  const outstanding = state.invoices.filter((i) => ['Issued', 'Receipt Uploaded'].includes(i.status))
  const verified = state.invoices.filter((i) => i.status === 'Payment Verified')
  const statusData = [
    { label: 'Issued', value: state.invoices.filter((i) => i.status === 'Issued').length, color: CHART.slate },
    { label: 'Receipt uploaded', value: state.invoices.filter((i) => i.status === 'Receipt Uploaded').length, color: CHART.primary },
    { label: 'Payment verified', value: verified.length, color: CHART.teal },
  ]
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Proformas to issue" value={toIssue.length} icon={<FileCheck2 className="size-4" />} tone="warning" hint="Approved requests" to="/app/orders" />
        <StatCard label="Receipts to verify" value={toVerify.length} icon={<Wallet className="size-4" />} tone="primary" to="/app/payments" hint="Uploaded by customers" />
        <StatCard label="Outstanding" value={money(outstanding.reduce((s, i) => s + toUsd(i.total, i.currency), 0), 'USD', { compact: true })} icon={<Receipt className="size-4" />} tone="neutral" hint={`${outstanding.length} invoice(s), USD equiv.`} to="/app/invoices" />
        <StatCard label="Verified (all time)" value={money(verified.reduce((s, i) => s + toUsd(i.total, i.currency), 0), 'USD', { compact: true })} icon={<CheckCircle2 className="size-4" />} tone="success" hint={`${verified.length} payments`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Payments awaiting verification" actions={<Link to="/app/payments" className="text-[13px] font-medium text-primary hover:underline">Open payments</Link>} />
          <ul className="divide-y divide-line">
            {toVerify.length === 0 && <li className="px-5 py-10 text-center text-[13px] text-muted">No receipts waiting.</li>}
            {toVerify.map((p) => (
              <li key={p.id}>
                <Link to={`/app/payments?verify=${p.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-canvas">
                  <Wallet className="size-4 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">{lookups.customer(p.customerId)?.name}</span>
                    <span className="block text-xs text-muted">{lookups.invoice(p.invoiceId)?.number} · uploaded {relative(p.receiptFile?.uploadedAt)}</span>
                  </span>
                  <span className="text-[13px] font-semibold tabular">{money(p.amount, p.currency)}</span>
                </Link>
              </li>
            ))}
            {toIssue.map((r) => (
              <li key={r.id}>
                <Link to={`/app/requests/${r.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-canvas">
                  <FileCheck2 className="size-4 text-warning" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">Issue proforma · {r.ref}</span>
                    <span className="block text-xs text-muted">{lookups.customer(r.customerId)?.name} · approved {relative(r.updatedAt)}</span>
                  </span>
                  <span className="text-[13px] font-semibold tabular">{money(requestTotal(r), r.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <ChartCard title="Proforma status" demo={false}>
          <Donut data={statusData} centerLabel="invoices" centerValue={String(state.invoices.length)} />
        </ChartCard>
      </div>
      <ChartCard title="Cash collected" description="Verified payment advice · USD equivalent · last 12 months" demo={false}>
        <TrendArea data={monthlyTotals(state.payments.filter((p) => p.status === 'Verified'), (p) => p.verifiedAt ?? p.valueDate, (p) => toUsd(p.amount, p.currency))} valueLabel="Collected" currency="USD" />
      </ChartCard>
    </div>
  )
}

// ─── Logistics ────────────────────────────────────────────────────────────

function LogisticsDashboard() {
  const { state } = useStore()
  const lookups = useLookups()
  const cols = ['Payment Verified', 'Ready for Warehouse Preparation', 'Documents in Progress', 'Ready for Collection'] as const
  const count = (s: string) => state.shipments.filter((x) => x.status === s).length
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ready to prepare" value={count('Payment Verified')} icon={<Warehouse className="size-4" />} tone="warning" hint="Payment verified" to="/app/shipments" />
        <StatCard label="Documents in progress" value={count('Documents in Progress') + count('Ready for Warehouse Preparation')} icon={<FileCheck2 className="size-4" />} tone="primary" to="/app/shipments" />
        <StatCard label="Ready for collection" value={count('Ready for Collection')} icon={<PackageCheck className="size-4" />} tone="success" to="/app/collection" />
        <StatCard label="Awaiting payment" value={count('Awaiting Payment') + count('Approved')} icon={<Clock className="size-4" />} tone="neutral" hint="Upcoming workload" />
      </div>
      <div>
        <h2 className="mb-3 text-[15px] font-semibold">Fulfilment board</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cols.map((c) => {
            const items = state.shipments.filter((s) => s.status === c)
            return (
              <div key={c} className="rounded-lg border border-line bg-slate-50/80 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <p className="text-[13px] font-semibold">{c}</p>
                  <span className="rounded-full bg-surface px-2 text-xs font-medium text-muted ring-1 ring-line">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.length === 0 && <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-muted">Empty</p>}
                  {items.map((s) => (
                    <Link key={s.id} to={`/app/shipments/${s.id}`} className="block rounded-lg border border-line bg-surface p-3 shadow-[var(--shadow-card)] hover:border-primary/40">
                      <p className="font-mono text-xs font-medium">{s.ref}</p>
                      <p className="mt-0.5 truncate text-[13px] font-medium">{lookups.customer(s.customerId)?.name}</p>
                      <p className="mt-2 flex items-center justify-between text-xs text-muted">
                        <span>{s.cartons} ctns · {num(s.grossWeightKg)} kg</span>
                        <span>{relative(s.history.at(-1)?.at)}</span>
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <TaskPanel />
    </div>
  )
}

// ─── Administrator ────────────────────────────────────────────────────────

function AdminDashboard() {
  const { state } = useStore()
  const failed = state.integrationEvents.filter((e) => e.status === 'Failed')
  const audit = state.requests.flatMap((r) => r.activity.map((a) => ({ ...a, action: `${a.action} — ${r.ref}` }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 7)
  const nameOf = (id: string) => state.users.find((u) => u.id === id)?.name ?? 'System'
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active users" value={state.users.filter((u) => u.active && u.id !== 'u-system').length} icon={<Users className="size-4" />} to="/app/admin/users" hint={`${state.users.filter((u) => !u.active).length} inactive`} />
        <StatCard label="Territories" value={state.territories.length} icon={<GitBranch className="size-4" />} tone="neutral" hint="4 regions" to="/app/admin/territories" />
        <StatCard label="Sync failures" value={failed.length} icon={<AlertTriangle className="size-4" />} tone={failed.length ? 'danger' : 'success'} hint="Simulated integration" to="/app/admin/integration" />
        <StatCard label="Approval rules" value={state.approvalRules.filter((r) => r.active).length} icon={<ClipboardList className="size-4" />} tone="primary" hint="Active value bands" to="/app/admin/workflow" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Integration health" description="Simulated channels — no live ERP connection" icon={<Activity className="size-5" />} actions={<Link to="/app/admin/integration" className="text-[13px] font-medium text-primary hover:underline">Monitor</Link>} />
          <ul className="divide-y divide-line">
            {state.integrationChannels.map((c) => (
              <li key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3 sm:grid-cols-[1fr_140px_auto]">
                <div>
                  <p className="text-[13px] font-medium">{c.name}</p>
                  <p className="text-xs text-muted">Last sync {relative(c.lastSyncAt)} · {c.latencyMs} ms</p>
                </div>
                <div className="hidden sm:block">
                  <ProgressBar value={c.successRate} tone={c.successRate > 97 ? 'success' : 'warning'} />
                  <p className="mt-1 text-right text-[11px] text-muted tabular">{c.successRate}% success</p>
                </div>
                <StatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Audit trail" description="Latest workflow events" />
          <div className="p-5"><ActivityTimeline entries={audit} nameOf={nameOf} /></div>
        </Card>
      </div>
    </div>
  )
}
