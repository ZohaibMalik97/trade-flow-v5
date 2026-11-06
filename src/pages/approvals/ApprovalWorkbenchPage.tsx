import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import { pendingStep, requestTotal, useLookups, useStore } from '@/app/store'
import { useScope } from '@/hooks/useScope'
import { useSimulatedLoading } from '@/hooks/misc'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Tabs } from '@/components/ui/Tabs'
import { StatusBadge } from '@/components/ui/Badge'
import { KpiStrip } from '@/components/data-display/KpiStrip'
import { displayStatus, sentToSap } from '@/utils/requestStatus'
import { SAP_MODE_LABEL } from '@/services'
import { Avatar, EmptyState, SkeletonRows } from '@/components/ui/misc'
import { DataTable, type Column } from '@/components/data-display/DataTable'
import { FilterBar, FilterSelect, SearchInput } from '@/components/data-display/FilterBar'
import { SlaIndicator } from '@/components/data-display/ApprovalChain'
import { brands } from '@/data/reference'
import { toUsd } from '@/utils/fx'
import { date, hoursBetween, money, relative } from '@/utils/format'
import type { SalesOrderRequest } from '@/types/domain'

type TabKey = 'mine' | 'all' | 'sap' | 'everything' | 'decided'
type KpiKey = '' | 'total' | 'pending' | 'review' | 'approved' | 'rejected' | 'sap'

export default function ApprovalWorkbenchPage() {
  const { state, user, canAny } = useStore()
  const scope = useScope()
  const lookups = useLookups()
  const navigate = useNavigate()
  const loading = useSimulatedLoading(350)
  const isApprover = canAny('order.approve', 'order.reject')
  const [params] = useSearchParams()
  const [tab, setTab] = useState<TabKey>((params.get('tab') as TabKey) || (isApprover ? 'mine' : 'all'))
  const [q, setQ] = useState('')
  const [territory, setTerritory] = useState('')
  const [stage, setStage] = useState('')
  const [sla, setSla] = useState('')
  const [kpi, setKpi] = useState<KpiKey>('')

  const submitted = scope.requests.filter((r) => r.status !== 'Draft')
  const allPending = submitted.filter((r) => r.status === 'Pending Approval')
  const sapQueue = submitted.filter((r) => r.status === 'Approved' && r.sap && !sentToSap(r))
  const decided = state.requests.filter((r) => r.approvalSteps.some((s) => s.actedById === user.id))
  const kpiMatch: Record<Exclude<KpiKey, ''>, (r: SalesOrderRequest) => boolean> = {
    total: () => true,
    pending: (r) => displayStatus(r) === 'Pending Approval',
    review: (r) => displayStatus(r) === 'Under Review',
    approved: (r) => ['Approved', 'Awaiting Payment', 'Payment Verified', 'In Fulfillment', 'Ready for Collection', 'Collected'].includes(r.status),
    rejected: (r) => r.status === 'Rejected',
    sap: sentToSap,
  }
  const base = kpi ? submitted.filter(kpiMatch[kpi]) : tab === 'mine' ? scope.approvalQueue : tab === 'all' ? allPending : tab === 'sap' ? sapQueue : tab === 'everything' ? submitted : decided
  const selectKpi = (k: string) => { setKpi(k as KpiKey); if (k) setTab('everything') }

  const slaState = (r: SalesOrderRequest) => {
    const s = pendingStep(r)
    if (!s?.enteredAt) return 'ok'
    const ratio = hoursBetween(s.enteredAt) / s.slaHours
    return ratio > 1 ? 'breached' : ratio > 0.6 ? 'risk' : 'ok'
  }

  const rows = useMemo(
    () =>
      base.filter(
        (r) =>
          (!q || `${r.ref} ${lookups.customer(r.customerId)?.name}`.toLowerCase().includes(q.toLowerCase())) &&
          (!territory || r.territoryId === territory) &&
          (!stage || pendingStep(r)?.stage === stage) &&
          (!sla || slaState(r) === sla),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, q, territory, stage, sla, lookups],
  )

  const brandNames = (r: SalesOrderRequest) => [...new Set(r.lines.map((l) => lookups.product(l.productId)!.brandId))].map((b) => brands.find((x) => x.id === b)!.name)
  const myStepFor = (r: SalesOrderRequest) => r.approvalSteps.find((s) => s.actedById === user.id)

  const columns: Column<SalesOrderRequest>[] = [
    { key: 'ref', header: 'Request', primary: true, sortValue: (r) => r.ref, cell: (r) => <span className="whitespace-nowrap font-mono text-[12px] font-semibold">{r.ref}</span> },
    { key: 'customer', header: 'Customer', sortValue: (r) => lookups.customer(r.customerId)?.name ?? '', cell: (r) => <span className="font-medium">{lookups.customer(r.customerId)?.name}</span> },
    { key: 'submitted', header: 'Date', sortValue: (r) => r.createdAt, cell: (r) => <span title={relative(r.createdAt)}>{date(r.createdAt)}</span> },
    {
      key: 'products', header: 'Products', align: 'right', hideOnMobile: true, sortValue: (r) => r.lines.length,
      cell: (r) => { const b = brandNames(r); return <span className="tabular" title={b.join(', ')}>{r.lines.length}<span className="block text-[11px] text-muted">{r.lines.reduce((n, l) => n + l.quantity, 0).toLocaleString()} units</span></span> },
    },
    { key: 'value', header: 'Total', align: 'right', sortValue: (r) => toUsd(requestTotal(r), r.currency), cell: (r) => <span className="font-medium tabular">{money(requestTotal(r), r.currency, { compact: true })}<span className="block text-[11px] font-normal text-muted">≈ {money(toUsd(requestTotal(r), r.currency), 'USD', { compact: true })}</span></span> },
    { key: 'status', header: 'Status', sortValue: (r) => displayStatus(r), cell: (r) => <StatusBadge status={displayStatus(r)} /> },
    {
      key: 'rep', header: 'Assigned rep', hideOnMobile: true,
      cell: (r) => { const u = lookups.user(state.territories.find((t) => t.id === r.territoryId)?.managerId); return u ? <span className="flex items-center gap-2 whitespace-nowrap"><Avatar name={u.name} size="xs" />{u.name}</span> : '—' },
    },
    ...(tab === 'decided'
      ? ([
          { key: 'mydecision', header: 'My decision', cell: (r) => { const s = myStepFor(r)!; return <span><StatusBadge status={s.status} /><span className="mt-0.5 block text-[11px] text-muted">{relative(s.actedAt)}</span></span> } },
        ] as Column<SalesOrderRequest>[])
      : tab === 'sap' || tab === 'everything'
      ? ([] as Column<SalesOrderRequest>[])
      : ([
          {
            key: 'stage', header: 'Current stage', sortValue: (r) => r.approvalSteps.indexOf(pendingStep(r)!),
            cell: (r) => { const s = pendingStep(r); return s ? <span className="whitespace-nowrap text-[12px]"><span className="font-medium">{s.stage}</span><span className="block text-muted">Level {r.approvalSteps.indexOf(s) + 1}/{r.approvalSteps.length}</span></span> : '—' },
          },
          {
            key: 'approver', header: 'Current approver', hideOnMobile: true,
            cell: (r) => { const s = pendingStep(r); const u = lookups.user(s?.approverId); return u ? <span className="whitespace-nowrap">{u.name}</span> : '—' },
          },
          {
            key: 'sla', header: 'SLA', sortValue: (r) => { const s = pendingStep(r); return s?.enteredAt ? hoursBetween(s.enteredAt) / s.slaHours : 0 },
            cell: (r) => { const s = pendingStep(r); return s ? <SlaIndicator step={s} /> : '—' },
          },
        ] as Column<SalesOrderRequest>[])),
    { key: 'action', header: <span className="sr-only">Actions</span>, align: 'right', cell: (r) => <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[12px] font-medium text-primary">{scope.approvalQueue.includes(r) ? 'Review' : tab === 'sap' ? 'Submit' : 'Open'}<ChevronRight className="size-3.5" /></span> },
  ]

  const breachedCount = (isApprover ? scope.approvalQueue : allPending).filter((r) => slaState(r) === 'breached').length
  const count = (k: Exclude<KpiKey, ''>) => submitted.filter(kpiMatch[k]).length

  return (
    <>
      <PageHeader
        title="Sales request approvals"
        description={isApprover ? `Requests waiting at your approval level${breachedCount ? ` · ${breachedCount} past SLA` : ''}. Approval is internal; SAP submission is a separate step.` : 'Monitor requests moving through internal approval and SAP submission.'}
        breadcrumbs={[{ label: 'Sales' }, { label: 'Request approvals' }]}
        meta={<span className="text-xs text-muted">{SAP_MODE_LABEL}</span>}
      />

      <KpiStrip
        active={kpi}
        onSelect={selectKpi}
        items={[
          { key: 'total', label: 'Total requests', value: count('total'), tone: 'neutral' },
          { key: 'pending', label: 'Pending approval', value: count('pending'), tone: 'warning' },
          { key: 'review', label: 'Under review', value: count('review'), tone: 'info', hint: 'Escalated level' },
          { key: 'approved', label: 'Approved', value: count('approved'), tone: 'success' },
          { key: 'rejected', label: 'Rejected', value: count('rejected'), tone: 'danger' },
          { key: 'sap', label: 'Submitted to SAP', value: count('sap'), tone: 'primary', hint: `${sapQueue.length} awaiting submission` },
        ]}
      />

      <Card>
        <Tabs
          className="px-3"
          value={tab}
          onChange={(t) => { setTab(t); setKpi('') }}
          items={[
            ...(isApprover ? [{ key: 'mine' as const, label: 'My queue', count: scope.approvalQueue.length }] : []),
            { key: 'all', label: 'All in approval', count: allPending.length },
            { key: 'sap', label: 'Awaiting SAP submission', count: sapQueue.length },
            { key: 'everything', label: kpi ? 'Filtered by KPI' : 'All requests', count: kpi ? base.length : submitted.length },
            { key: 'decided', label: 'Decided by me', count: decided.length },
          ]}
        />
        <FilterBar active={!!(q || territory || stage || sla || kpi)} onReset={() => { setQ(''); setTerritory(''); setStage(''); setSla(''); setKpi('') }}>
          <SearchInput value={q} onChange={setQ} placeholder="Request or customer…" className="w-full sm:w-60" />
          <FilterSelect label="Territory" value={territory} onChange={setTerritory} options={state.territories.filter((t) => base.some((r) => r.territoryId === t.id)).map((t) => ({ value: t.id, label: t.name }))} />
          {(tab === 'mine' || tab === 'all') && <FilterSelect label="Stage" value={stage} onChange={setStage} options={['Account Manager', 'Regional Manager', 'Head of Sales'].map((s) => ({ value: s, label: s }))} />}
          {(tab === 'mine' || tab === 'all') && <FilterSelect label="SLA" value={sla} onChange={setSla} options={[{ value: 'breached', label: 'Breached' }, { value: 'risk', label: 'At risk' }, { value: 'ok', label: 'On track' }]} />}
        </FilterBar>
        {loading ? (
          <SkeletonRows rows={6} />
        ) : (
          <DataTable
            key={tab + kpi}
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/app/approvals/${r.id}`)}
            initialSort={tab === 'mine' || tab === 'all' ? { key: 'sla', dir: 'desc' } : { key: 'submitted', dir: 'desc' }}
            caption="Approval queue"
            empty={<EmptyState icon={<CheckCircle2 className="size-5" />} title={tab === 'mine' ? 'Your queue is clear' : tab === 'sap' ? 'Nothing waiting for SAP' : 'Nothing to show'} description={tab === 'mine' ? 'New requests at your level will appear here.' : tab === 'sap' ? 'Internally approved requests that still need to be sent to SAP appear here.' : 'Adjust filters or switch tabs.'} />}
          />
        )}
      </Card>
    </>
  )
}
