import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, CreditCard, Eye, FileText, FlaskConical, X } from 'lucide-react'
import { useLookups, useStore } from '@/app/store'
import { useScope } from '@/hooks/useScope'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Tabs } from '@/components/ui/Tabs'
import { DemoTag, StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Dialog'
import { EmptyState, KeyValue, Notice } from '@/components/ui/misc'
import { Checkbox, TextareaField } from '@/components/forms/Field'
import { DataTable, type Column } from '@/components/data-display/DataTable'
import { DocumentPreview } from '@/components/data-display/DocumentPreview'
import { useToast } from '@/components/ui/Toast'
import { date, dateTime, fileSize, money } from '@/utils/format'
import type { Payment } from '@/types/domain'

type TabKey = 'all' | 'pending' | 'verified' | 'awaiting'
const CHECKS = ['Amount matches the proforma total', 'Payment reference quotes the proforma number', 'Remitter name matches the customer', 'Funds visible on bank statement (simulated)']

export default function PaymentsPage() {
  const scope = useScope()
  const { user, can, verifyPayment } = useStore()
  const lookups = useLookups()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<TabKey>(can('payment.verify') ? 'pending' : 'all')
  const [checks, setChecks] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()
  const [preview, setPreview] = useState<{ name: string; type: string; sizeKb: number } | null>(null)

  const verifyId = params.get('verify')
  const selected = scope.payments.find((p) => p.id === verifyId)
  const close = () => {
    setParams({})
    setChecks([])
    setNote('')
    setError(undefined)
  }

  const match: Record<TabKey, (p: Payment) => boolean> = {
    all: () => true,
    pending: (p) => p.status === 'Receipt Uploaded' || p.status === 'Under Verification',
    verified: (p) => p.status === 'Verified',
    awaiting: (p) => p.status === 'Awaiting Receipt' || p.status === 'Rejected',
  }
  const rows = scope.payments.filter(match[tab])

  const columns: Column<Payment>[] = [
    { key: 'ref', header: 'Payment', primary: true, sortValue: (p) => p.ref, cell: (p) => <span className="font-mono text-[12px] font-semibold">{p.ref}</span> },
    ...(user.kind !== 'external' ? [{ key: 'customer', header: 'Customer', sortValue: (p: Payment) => lookups.customer(p.customerId)?.name ?? '', cell: (p: Payment) => <span className="font-medium">{lookups.customer(p.customerId)?.name}</span> } as Column<Payment>] : []),
    { key: 'inv', header: 'Proforma', cell: (p) => <Link onClick={(e) => e.stopPropagation()} to={`/app/invoices/${p.invoiceId}`} className="font-mono text-[12px] text-primary hover:underline">{lookups.invoice(p.invoiceId)?.number}</Link> },
    { key: 'method', header: 'Method', hideOnMobile: true, cell: (p) => <span className="text-muted">{p.method}</span> },
    { key: 'uploaded', header: 'Receipt', sortValue: (p) => p.receiptFile?.uploadedAt ?? '', cell: (p) => (p.receiptFile ? date(p.receiptFile.uploadedAt) : <span className="text-muted">—</span>) },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (p) => p.amount, cell: (p) => <span className="font-medium tabular">{money(p.amount, p.currency)}</span> },
    { key: 'status', header: 'Status', sortValue: (p) => p.status, cell: (p) => <StatusBadge status={p.status} /> },
    ...(can('payment.verify')
      ? [{ key: 'act', header: '', align: 'right' as const, cell: (p: Payment) => (p.status === 'Receipt Uploaded' ? <Button size="xs" onClick={(e) => { e.stopPropagation(); setParams({ verify: p.id }) }}>Verify</Button> : null) }]
      : []),
  ]

  const decide = async (decision: 'verify' | 'reject') => {
    if (!selected) return
    if (decision === 'verify' && checks.length < CHECKS.length) return setError('Complete every check before verifying.')
    if (decision === 'reject' && note.trim().length < 5) return setError('Explain why the receipt is rejected.')
    const res = await verifyPayment(selected.id, decision, note.trim())
    if (!res.ok) return setError(res.error)
    toast.success(decision === 'verify' ? 'Payment verified' : 'Receipt rejected', decision === 'verify' ? 'The order moves to warehouse preparation.' : 'The customer is asked to re-upload.')
    close()
  }

  return (
    <>
      <PageHeader title="Payment advice" description="Proof of payment uploaded against proforma requests, pending verification by Finance. Advice never marks an SAP invoice as paid — posted payments are under Finance › Payments." breadcrumbs={[{ label: 'Finance' }, { label: 'Payment advice' }]} meta={<DemoTag>Pending verification until SAP posts the payment</DemoTag>} />
      <Notice tone="info" className="mb-4" icon={<CreditCard className="size-4" />}>
        <strong>Receipt uploaded</strong> means the customer has provided proof of transfer. <strong>Verified</strong> means Finance confirmed the funds — only then is the order released to the warehouse.
      </Notice>
      <Card>
        <Tabs
          className="px-3"
          value={tab}
          onChange={setTab}
          items={[
            { key: 'all', label: 'All', count: scope.payments.length },
            { key: 'pending', label: 'Pending verification', count: scope.payments.filter(match.pending).length },
            { key: 'awaiting', label: 'Awaiting receipt', count: scope.payments.filter(match.awaiting).length },
            { key: 'verified', label: 'Verified', count: scope.payments.filter(match.verified).length },
          ]}
        />
        <DataTable
          key={tab}
          rows={rows}
          columns={columns}
          rowKey={(p) => p.id}
          onRowClick={(p) => setParams({ verify: p.id })}
          initialSort={{ key: 'uploaded', dir: 'desc' }}
          selectedKey={verifyId ?? undefined}
          empty={<EmptyState icon={<CreditCard className="size-5" />} title="Nothing here" description="Payments appear when proforma invoices are issued." />}
        />
      </Card>

      <Drawer
        open={!!selected}
        onClose={close}
        title={selected ? `${selected.ref}` : ''}
        description={selected ? `${lookups.customer(selected.customerId)?.name} · ${lookups.invoice(selected.invoiceId)?.number}` : undefined}
        footer={
          selected && can('payment.verify') && selected.status === 'Receipt Uploaded' ? (
            <>
              <Button variant="secondary" className="text-danger-700" icon={<X className="size-4" />} onClick={() => decide('reject')}>Reject receipt</Button>
              <Button variant="success" icon={<CheckCircle2 className="size-4" />} onClick={() => decide('verify')}>Mark as verified</Button>
            </>
          ) : (
            <Button variant="secondary" onClick={close}>Close</Button>
          )
        }
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <StatusBadge status={selected.status} />
            </div>
            <div className="rounded-lg bg-canvas p-4">
              <p className="text-xs text-muted">Amount due on proforma</p>
              <p className="text-2xl font-semibold tabular">{money(lookups.invoice(selected.invoiceId)!.total, selected.currency)}</p>
            </div>
            <KeyValue
              items={[
                { label: 'Declared amount', value: money(selected.amount, selected.currency) },
                { label: 'Method', value: selected.method },
                { label: 'Value date', value: date(selected.valueDate) },
                { label: 'Remitting bank', value: selected.payerBank ?? '—' },
                ...(selected.verifiedAt ? [{ label: 'Verified', value: `${lookups.user(selected.verifiedById)?.name} · ${dateTime(selected.verifiedAt)}` }] : []),
              ]}
            />
            {selected.receiptFile ? (
              <div className="flex items-center gap-3 rounded-lg border border-line p-3">
                <FileText className="size-5 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{selected.receiptFile.name}</span>
                  <span className="block text-xs text-muted">{fileSize(selected.receiptFile.sizeKb)} · {dateTime(selected.receiptFile.uploadedAt)}</span>
                </span>
                <Button size="sm" variant="ghost" icon={<Eye className="size-4" />} onClick={() => setPreview({ name: selected.receiptFile!.name, type: 'Payment Receipt', sizeKb: selected.receiptFile!.sizeKb })}>View</Button>
              </div>
            ) : (
              <Notice tone="warning">No receipt uploaded yet.</Notice>
            )}
            {selected.note && <Notice tone={selected.status === 'Rejected' ? 'danger' : 'info'} title="Finance note">{selected.note}</Notice>}
            {can('payment.verify') && selected.status === 'Receipt Uploaded' && (
              <>
                <fieldset className="space-y-2.5">
                  <legend className="label">Verification checklist</legend>
                  {CHECKS.map((c) => (
                    <Checkbox key={c} label={c} checked={checks.includes(c)} onChange={() => { setError(undefined); setChecks(checks.includes(c) ? checks.filter((x) => x !== c) : [...checks, c]) }} />
                  ))}
                </fieldset>
                <TextareaField label="Note" placeholder="Required when rejecting" value={note} onChange={(e) => { setNote(e.target.value); setError(undefined) }} rows={3} />
                {error && <p role="alert" className="text-xs font-medium text-danger-700">{error}</p>}
                <p className="flex items-start gap-1.5 text-xs text-muted"><FlaskConical className="mt-0.5 size-3.5 shrink-0" />Verifying advice does not post a payment in SAP or mark any SAP invoice as paid; SAP posting and allocation remain authoritative.</p>
              </>
            )}
          </div>
        )}
      </Drawer>
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
    </>
  )
}
