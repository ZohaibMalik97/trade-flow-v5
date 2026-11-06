import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Activity, ArrowDownLeft, ArrowUpRight, FlaskConical, Loader2, RefreshCw, ServerCog, Unplug } from 'lucide-react'
import { useStore } from '@/app/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { DemoTag, StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Dialog'
import { EmptyState, KeyValue, Notice, ProgressBar } from '@/components/ui/misc'
import { DataTable, type Column } from '@/components/data-display/DataTable'
import { FilterBar, FilterSelect, SearchInput } from '@/components/data-display/FilterBar'
import { useToast } from '@/components/ui/Toast'
import { services, SAP_MODE } from '@/services'
import { SapSimulator } from '@/components/sap/SapSimulator'
import { Link } from 'react-router-dom'
import { dateTime, relative } from '@/utils/format'
import type { IntegrationEvent } from '@/types/domain'

export default function IntegrationMonitorPage() {
  const { state, setIntegrationEvent, can } = useStore()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [entity, setEntity] = useState('')
  const [retrying, setRetrying] = useState<Set<string>>(new Set())

  const events = state.integrationEvents.filter((e) => (!q || `${e.objectRef} ${e.targetRef ?? ''} ${e.message}`.toLowerCase().includes(q.toLowerCase())) && (!status || e.status === status) && (!entity || e.entity === entity))
  const selected = state.integrationEvents.find((e) => e.id === params.get('event'))
  const failed = state.integrationEvents.filter((e) => e.status === 'Failed')
  const overall = state.integrationChannels.some((c) => c.status === 'Down') ? 'Down' : state.integrationChannels.some((c) => c.status === 'Degraded') ? 'Degraded' : 'Operational'
  const lastSync = [...state.integrationChannels].sort((a, b) => b.lastSyncAt.localeCompare(a.lastSyncAt))[0]

  const retry = async (e: IntegrationEvent) => {
    // Sales-order creation is retried from the request (idempotent SAP call), never marked synced here.
    if (e.entity === 'Sales Order') return
    setRetrying((s) => new Set(s).add(e.id))
    setIntegrationEvent({ ...e, status: 'Retrying' })
    const res = await services.integration.retry(e)
    setIntegrationEvent(res)
    setRetrying((s) => {
      const n = new Set(s)
      n.delete(e.id)
      return n
    })
    if (res.status === 'Synced') toast.success(`${e.objectRef} synchronised`, 'Simulated retry succeeded.')
    else toast.error(`${e.objectRef} still failing`, res.message)
  }

  const columns: Column<IntegrationEvent>[] = [
    { key: 'obj', header: 'Record', primary: true, sortValue: (e) => e.objectRef, cell: (e) => <span><span className="block font-mono text-[12px] font-semibold">{e.objectRef}</span><span className="block text-[11px] text-muted">{e.entity}</span></span> },
    { key: 'dir', header: 'Direction', hideOnMobile: true, cell: (e) => <span className="inline-flex items-center gap-1 text-muted">{e.direction === 'Outbound' ? <ArrowUpRight className="size-3.5" /> : <ArrowDownLeft className="size-3.5" />}{e.direction}</span> },
    { key: 'target', header: 'Target ref', hideOnMobile: true, cell: (e) => <span className="font-mono text-[12px] text-muted">{e.targetRef ?? '—'}</span> },
    { key: 'msg', header: 'Message', hideOnMobile: true, cell: (e) => <span className="line-clamp-1 max-w-80 text-muted">{e.errorCode && <span className="mr-1 font-mono text-danger-700">{e.errorCode}</span>}{e.message}</span> },
    { key: 'at', header: 'Last attempt', sortValue: (e) => e.at, cell: (e) => <span title={dateTime(e.at)}>{relative(e.at)}</span> },
    { key: 'attempts', header: 'Tries', align: 'right', sortValue: (e) => e.attempts, cell: (e) => <span className="tabular">{e.attempts}</span> },
    { key: 'status', header: 'Status', sortValue: (e) => e.status, cell: (e) => <StatusBadge status={e.status} /> },
    {
      key: 'act', header: '', align: 'right',
      cell: (e) =>
        e.entity === 'Sales Order' && e.status === 'Failed' ? (
          (() => {
            const r = state.requests.find((x) => x.ref === e.objectRef)
            return r ? <Link to={`/app/requests/${r.id}`} onClick={(ev) => ev.stopPropagation()} className="whitespace-nowrap text-[12px] font-medium text-primary hover:underline">Retry from request</Link> : null
          })()
        ) : e.status === 'Failed' || e.status === 'Retrying' ? (
          <Button size="xs" variant="secondary" disabled={retrying.has(e.id)} icon={retrying.has(e.id) ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} onClick={(ev) => { ev.stopPropagation(); void retry(e) }}>
            Retry
          </Button>
        ) : null,
    },
  ]

  return (
    <>
      <PageHeader
        title="Integration monitor"
        description="How ERP synchronisation would be supervised once a backend exists."
        breadcrumbs={[{ label: 'Administration' }, { label: 'Integration Monitor' }]}
        meta={SAP_MODE === 'mock' ? <DemoTag>SAP development mock</DemoTag> : undefined}
        actions={<Button variant="secondary" icon={<RefreshCw className="size-4" />} disabled={!failed.filter((e) => e.entity !== 'Sales Order').length || retrying.size > 0} onClick={() => failed.forEach((e) => void retry(e))}>Retry failed syncs ({failed.filter((e) => e.entity !== 'Sales Order').length})</Button>}
      />

      {SAP_MODE === 'mock' && can('integration.retry') && <div className="mb-4"><SapSimulator /></div>}

      {SAP_MODE === 'mock' && (
        <Notice tone="demo" icon={<Unplug className="size-4" />} className="mb-4" title="SAP development mock">
          The server runs with Sap:Mode=Mock. Submissions, retries and events on this page are real server records, but SAP responses come from the development mock — no SAP system is called.
        </Notice>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4"><p className="text-xs text-muted">Connection status</p><p className="mt-1 flex items-center gap-2 text-lg font-semibold"><span className={`size-2.5 rounded-full ${overall === 'Operational' ? 'bg-success' : overall === 'Degraded' ? 'bg-warning' : 'bg-danger'}`} />{overall}</p><p className="text-[11px] text-muted">{state.integrationChannels.filter((c) => c.status !== 'Operational').length} channel(s) below target</p></div>
        <div className="card p-4"><p className="text-xs text-muted">Last synchronisation</p><p className="mt-1 text-lg font-semibold">{relative(lastSync?.lastSyncAt)}</p><p className="text-[11px] text-muted">{dateTime(lastSync?.lastSyncAt)}</p></div>
        <div className="card p-4"><p className="text-xs text-muted">Failed records</p><p className="mt-1 text-lg font-semibold text-danger-700 tabular">{failed.length}</p><p className="text-[11px] text-muted">Need attention</p></div>
        <div className="card p-4"><p className="text-xs text-muted">Pending / retrying</p><p className="mt-1 text-lg font-semibold tabular">{state.integrationEvents.filter((e) => e.status === 'Pending' || e.status === 'Retrying').length}</p><p className="text-[11px] text-muted">In queue</p></div>
      </div>

      <Card className="mb-4">
        <CardHeader title="Channels" icon={<ServerCog className="size-5" />} />
        <ul className="grid divide-y divide-line md:grid-cols-2 md:divide-y-0 xl:grid-cols-5">
          {state.integrationChannels.map((c) => (
            <li key={c.id} className="p-5 md:border-b md:border-line xl:border-b-0 xl:border-r xl:last:border-r-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-medium">{c.name}</p>
                <StatusBadge status={c.status} />
              </div>
              <ProgressBar className="mt-3" value={c.successRate} tone={c.successRate > 97 ? 'success' : 'warning'} />
              <p className="mt-2 text-xs text-muted">{c.successRate}% success · {c.latencyMs} ms · {relative(c.lastSyncAt)}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Synchronisation log" description="Customer (business partner), sales order, pricing, billing and delivery examples" icon={<Activity className="size-5" />} />
        <FilterBar active={!!(q || status || entity)} onReset={() => { setQ(''); setStatus(''); setEntity('') }}>
          <SearchInput value={q} onChange={setQ} placeholder="Reference or message…" className="w-full sm:w-64" />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={['Synced', 'Pending', 'Failed', 'Retrying'].map((s) => ({ value: s, label: s }))} />
          <FilterSelect label="Entity" value={entity} onChange={setEntity} options={[...new Set(state.integrationEvents.map((e) => e.entity))].map((s) => ({ value: s, label: s }))} />
        </FilterBar>
        <DataTable rows={events} columns={columns} rowKey={(e) => e.id} onRowClick={(e) => setParams({ event: e.id })} initialSort={{ key: 'at', dir: 'desc' }} selectedKey={selected?.id} empty={<EmptyState icon={<Activity className="size-5" />} title="No events match" />} />
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => setParams({})}
        title={selected?.objectRef ?? ''}
        description={selected ? `${selected.entity} · ${selected.direction}` : undefined}
        footer={
          selected && (selected.status === 'Failed' || selected.status === 'Retrying') ? (
            <Button icon={retrying.has(selected.id) ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} disabled={retrying.has(selected.id)} onClick={() => void retry(selected)}>Retry now (simulated)</Button>
          ) : (
            <Button variant="secondary" onClick={() => setParams({})}>Close</Button>
          )
        }
      >
        {selected && (
          <div className="space-y-5">
            <StatusBadge status={selected.status} />
            {selected.errorCode && <Notice tone="danger" title={selected.errorCode}>{selected.message}</Notice>}
            {!selected.errorCode && <p className="text-[13px]">{selected.message}</p>}
            <KeyValue items={[
              { label: 'Target reference', value: selected.targetRef ?? '—' },
              { label: 'Attempts', value: selected.attempts },
              { label: 'Last attempt', value: dateTime(selected.at) },
              { label: 'Direction', value: selected.direction },
            ]} />
            <div>
              <p className="eyebrow mb-2">Payload summary</p>
              <pre className="scroll-thin overflow-x-auto rounded-lg bg-midnight p-4 font-mono text-xs leading-relaxed text-slate-200">{selected.payloadPreview}</pre>
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted"><FlaskConical className="mt-0.5 size-3.5 shrink-0" />Summary recorded by TradeFlow. The integration contract is described in docs/SAP_INTEGRATION_CONTRACT.md.</p>
          </div>
        )}
      </Drawer>
    </>
  )
}
