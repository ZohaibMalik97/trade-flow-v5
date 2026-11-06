import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, History, Lock } from 'lucide-react'
import { useLookups, useStore } from '@/app/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge, type Tone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState, Notice } from '@/components/ui/misc'
import { DataTable } from '@/components/data-display/DataTable'
import { FilterBar, FilterSelect, SearchInput } from '@/components/data-display/FilterBar'
import { ACTION_LABEL, stageById } from '@/workflow/engine'
import { dateTime } from '@/utils/format'

interface Row {
  id: string
  at: string
  actorId: string
  area: 'application' | 'order' | 'customer' | 'activity' | 'user' | 'role' | 'permission' | 'workflow' | 'territory' | 'auth'
  action: string
  target: string
  details?: string
  link?: string
}

const AREA_TONE: Record<Row['area'], Tone> = { application: 'primary', order: 'info', customer: 'success', activity: 'neutral', user: 'success', role: 'warning', permission: 'warning', workflow: 'neutral', territory: 'neutral', auth: 'dark' }

/**
 * Consolidated, read-only audit trail: workflow history of customer applications,
 * sales-order activity and administrative changes (users, roles, permissions, workflow, sign-ins).
 */
export default function AuditTrailPage() {
  const { state } = useStore()
  const lookups = useLookups()
  const [q, setQ] = useState('')
  const [area, setArea] = useState('')
  const [actor, setActor] = useState('')

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = state.adminAudit.map((e) => ({ ...e }))
    for (const a of state.applications)
      for (const e of a.history)
        out.push({
          id: e.id,
          at: e.at,
          actorId: e.actorId,
          area: 'application',
          action: ACTION_LABEL[e.action],
          target: `${a.ref} · ${a.companyName}`,
          details: [e.fromStatus && e.fromStatus !== e.toStatus ? `${e.fromStatus} → ${e.toStatus}` : e.toStatus, e.toStageId && `stage: ${stageById(state.onboardingWorkflow, e.toStageId)?.name}`, e.toUserId && `to: ${lookups.user(e.toUserId)?.name ?? e.toUserId}`, e.publicRemarks && `public: “${e.publicRemarks}”`, e.remarks && `internal: “${e.remarks}”`, e.visibility === 'internal' && '(internal event)']
            .filter(Boolean)
            .join(' · '),
          link: `/app/applications/${a.id}`,
        })
    for (const a of state.activities)
      out.push({ id: a.id, at: a.createdAt, actorId: a.ownerId, area: 'activity', action: `${a.type} ${a.status === 'Planned' ? 'planned' : 'recorded'}`, target: state.customers.find((c) => c.id === a.customerId)?.name ?? a.customerId, details: a.subject, link: `/app/customers/${a.customerId}` })
    for (const r of state.requests)
      for (const e of r.activity) out.push({ id: e.id, at: e.at, actorId: e.actorId, area: 'order', action: e.action, target: r.ref, details: e.comment, link: `/app/requests/${r.id}` })
    return out.sort((a, b) => b.at.localeCompare(a.at))
  }, [state, lookups])

  const nameOf = (id: string) => (id === 'system' || id === 'u-system' ? 'System' : id === 'guest' ? 'Unknown (sign-in attempt)' : lookups.user(id)?.name ?? id)
  const filtered = rows.filter((r) => (!area || r.area === area) && (!actor || r.actorId === actor) && (!q || `${r.action} ${r.target} ${r.details ?? ''} ${nameOf(r.actorId)}`.toLowerCase().includes(q.toLowerCase())))
  const actors = [...new Set(rows.map((r) => r.actorId))].map((id) => ({ value: id, label: nameOf(id) })).sort((a, b) => a.label.localeCompare(b.label))

  const exportCsv = () => {
    const csv = [['Time (UTC)', 'Area', 'Actor', 'Action', 'Target', 'Details'], ...filtered.map((r) => [r.at, r.area, nameOf(r.actorId), r.action, r.target, r.details ?? ''])]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    Object.assign(document.createElement('a'), { href: url, download: 'tradeflow-audit-trail.csv' }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Who did what and when — customer applications, sales orders, customer and territory changes, sales activities, users, roles, permissions, configuration and sign-ins."
        breadcrumbs={[{ label: 'Administration' }, { label: 'Audit Trail' }]}
        actions={<Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv}>Export CSV</Button>}
      />
      <Notice tone="info" className="mb-4" icon={<Lock className="size-4" />}>
        Entries are written server-side in the same transaction as the change and are append-only: the database rejects updates and deletes on the audit table. Times are server UTC.
      </Notice>
      <Card>
        <FilterBar active={!!(q || area || actor)} onReset={() => { setQ(''); setArea(''); setActor('') }}>
          <SearchInput value={q} onChange={setQ} placeholder="Search action, record, details…" label="Search audit trail" className="w-full sm:w-64" />
          <FilterSelect label="Area" value={area} onChange={setArea} options={Object.keys(AREA_TONE).map((a) => ({ value: a, label: a[0]!.toUpperCase() + a.slice(1) }))} />
          <FilterSelect label="Actor" value={actor} onChange={setActor} options={actors} />
        </FilterBar>
        <DataTable<Row>
          rows={filtered}
          rowKey={(r) => r.id}
          pageSize={25}
          caption="Audit trail"
          initialSort={{ key: 'at', dir: 'desc' }}
          dense
          columns={[
            { key: 'at', header: 'Time', sortValue: (r) => r.at, cell: (r) => <span className="whitespace-nowrap text-xs tabular">{dateTime(r.at)}</span> },
            { key: 'area', header: 'Area', sortValue: (r) => r.area, cell: (r) => <Badge tone={AREA_TONE[r.area]}>{r.area}</Badge> },
            { key: 'actor', header: 'Actor', sortValue: (r) => nameOf(r.actorId), cell: (r) => nameOf(r.actorId) },
            { key: 'action', header: 'Action', primary: true, cell: (r) => <span className="font-medium">{r.action}</span> },
            { key: 'target', header: 'Record', cell: (r) => (r.link ? <Link to={r.link} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{r.target}</Link> : r.target) },
            { key: 'details', header: 'Details', hideOnMobile: true, cell: (r) => <span className="line-clamp-2 text-xs text-muted">{r.details ?? '—'}</span> },
          ]}
          empty={<EmptyState icon={<History className="size-5" />} title="No audit entries match" />}
        />
      </Card>
    </>
  )
}
