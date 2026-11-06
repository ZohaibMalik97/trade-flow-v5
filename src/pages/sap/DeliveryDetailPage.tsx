import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Info, PackageCheck } from 'lucide-react'
import { MIN_REMARK, useLookups, useStore } from '@/app/store'
import { useSapQuery } from '@/hooks/useSap'
import { services } from '@/services'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { KeyValue, Notice } from '@/components/ui/misc'
import { TextareaField } from '@/components/forms/Field'
import { ProductImage } from '@/components/data-display/ProductImage'
import { useToast } from '@/components/ui/Toast'
import { SapSourceBar, SapState } from '@/components/sap/SapParts'
import { date, dateTime, num } from '@/utils/format'
import type { GoodsReceiptAck } from '@/types/domain'
import type { SapDeliveryView } from '@/types/sap'
import { receiptStatus } from './DeliveriesPage'

export default function DeliveryDetailPage() {
  const { dn = '' } = useParams()
  const { state, user, can } = useStore()
  const lookups = useLookups()
  const q = useSapQuery((ctx) => services.sapData.getDelivery(ctx, dn), [dn])

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{dn}</span>}
        meta={q.data && <span className="flex gap-1.5"><StatusBadge status={q.data.delivery.status} /><StatusBadge status={receiptStatus(q.data.delivery, state.goodsReceipts)} /></span>}
        description={q.data ? <>SAP delivery for sales order <Link className="font-mono text-primary hover:underline" to={`/app/orders/${q.data.delivery.soNumber}`}>{q.data.delivery.soNumber}</Link> · {lookups.customer(q.data.delivery.customerId)?.name}</> : 'SAP delivery'}
        breadcrumbs={[{ label: 'Deliveries', to: '/app/deliveries' }, { label: dn }]}
      />
      <SapState q={q} rows={6}>
        {({ delivery: d, order, mode, syncedAt }) => {
          const ack = state.goodsReceipts.find((g) => g.deliveryNumber === d.deliveryNumber)
          const canConfirm = can('delivery.confirm_receipt') && user.customerId === d.customerId && !ack && (d.status === 'Goods Issued' || d.status === 'Delivered')
          return (
            <div className="space-y-4">
              <SapSourceBar mode={mode} syncedAt={syncedAt} onRefresh={q.reload} loading={q.loading} />
              <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
                <div className="min-w-0 space-y-4">
                  <Card>
                    <CardHeader title="Delivered products" description="Quantities in this delivery, and what is still open on the sales order" />
                    <div className="overflow-x-auto">
                      <table className="w-full text-[13px]">
                        <thead>
                          <tr className="border-b border-line bg-canvas/70 text-left text-[11px] uppercase tracking-wide text-muted">
                            <th className="px-4 py-2">Product</th><th className="px-3 py-2 text-right">This delivery</th><th className="px-3 py-2 text-right">Ordered</th><th className="px-4 py-2 text-right">Pending on order</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.items.map((it) => {
                            const p = lookups.product(it.productId)
                            const soItem = order?.items.find((x) => x.itemNo === it.soItemNo)
                            return (
                              <tr key={it.itemNo} className="border-b border-line">
                                <td className="px-4 py-2"><span className="flex items-center gap-2.5">{p && <ProductImage product={p} size="xs" />}<span><span className="font-medium">{it.description}</span><span className="block font-mono text-[11px] text-muted">{p?.sku} · SAP {it.material}</span></span></span></td>
                                <td className="px-3 py-2 text-right font-medium tabular">{num(it.qty)} <span className="text-[11px] font-normal text-muted">{it.uom}</span></td>
                                <td className="px-3 py-2 text-right tabular text-muted">{soItem ? num(soItem.confirmedQty) : '—'}</td>
                                <td className="px-4 py-2 text-right tabular">{num(d.pendingQty[it.soItemNo] ?? 0)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                  {ack ? <ReceiptRecord ack={ack} /> : canConfirm ? <ConfirmReceipt delivery={d} /> : (
                    <Notice tone="info" icon={<Info className="size-4" />} title="Receipt confirmation">
                      {d.status === 'In Picking' ? 'The goods have not left the warehouse yet. You can confirm receipt once SAP posts the goods issue.' : user.kind === 'internal' ? 'The customer has not confirmed receipt of this delivery yet.' : 'Receipt confirmation is not available for this delivery.'}
                    </Notice>
                  )}
                </div>
                <Card>
                  <CardHeader title="Delivery" />
                  <CardBody>
                    <KeyValue
                      cols={1}
                      items={[
                        { label: 'SAP delivery', value: <span className="font-mono">{d.deliveryNumber}</span> },
                        { label: 'Sales order', value: <Link className="font-mono text-primary hover:underline" to={`/app/orders/${d.soNumber}`}>{d.soNumber}</Link> },
                        { label: 'Status (SAP)', value: <StatusBadge status={d.status} /> },
                        { label: 'Planned date', value: date(d.plannedDate) },
                        { label: 'Goods issue', value: d.goodsIssueDate ? date(d.goodsIssueDate) : 'Not yet posted' },
                        { label: 'Delivered (proof of delivery)', value: d.deliveredDate ? date(d.deliveredDate) : '—' },
                        { label: 'Ship-to', value: d.shipTo },
                        { label: 'Carrier / tracking', value: [d.carrier, d.trackingRef].filter(Boolean).join(' · ') || '—' },
                      ]}
                    />
                  </CardBody>
                </Card>
              </div>
            </div>
          )
        }}
      </SapState>
    </>
  )
}

function ConfirmReceipt({ delivery: d }: { delivery: SapDeliveryView }) {
  const { confirmGoodsReceipt } = useStore()
  const toast = useToast()
  const today = new Date().toISOString().slice(0, 10)
  const [issue, setIssue] = useState(false)
  const [receivedOn, setReceivedOn] = useState(today)
  const [remarks, setRemarks] = useState('')
  const [lines, setLines] = useState(() => d.items.map((it) => ({ itemNo: it.itemNo, receivedQty: it.qty, damagedQty: 0, note: '' })))
  const [review, setReview] = useState(false)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const set = (itemNo: number, patch: Partial<(typeof lines)[number]>) => setLines(lines.map((l) => (l.itemNo === itemNo ? { ...l, ...patch } : l)))
  const effective = issue ? lines : d.items.map((it) => ({ itemNo: it.itemNo, receivedQty: it.qty, damagedQty: 0, note: '' }))
  const hasDiscrepancy = effective.some((l) => l.receivedQty < (d.items.find((i) => i.itemNo === l.itemNo)?.qty ?? 0) || l.damagedQty > 0)

  const submit = async () => {
    setBusy(true)
    const res = await confirmGoodsReceipt({ deliveryNumber: d.deliveryNumber, receivedOn, remarks, lines: effective })
    setBusy(false)
    if (!res.ok) {
      setReview(false)
      return setError(res.error)
    }
    setReview(false)
    toast.success(`Receipt confirmed · ${res.ref}`, res.discrepancy ? 'Your discrepancy report was sent to our operations team.' : 'Thank you — recorded in TradeFlow.')
  }

  return (
    <Card className="border-primary/30 ring-1 ring-primary/10">
      <CardHeader title="Confirm goods received" description="Your acknowledgement of this delivery. It is recorded in TradeFlow and does not post anything in SAP." icon={<PackageCheck className="size-4" />} />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[12px] font-medium">
            Date received
            <input type="date" className="input mt-1 h-8 w-40" value={receivedOn} max={today} min={d.goodsIssueDate?.slice(0, 10)} onChange={(e) => setReceivedOn(e.target.value)} aria-label="Date received" />
          </label>
          <div className="inline-flex rounded-md border border-line p-0.5" role="radiogroup" aria-label="Receipt outcome">
            <button type="button" role="radio" aria-checked={!issue} onClick={() => setIssue(false)} className={`rounded px-2.5 py-1 text-[12.5px] font-medium ${!issue ? 'bg-primary text-white' : 'text-muted hover:text-ink'}`}>Everything received in good condition</button>
            <button type="button" role="radio" aria-checked={issue} onClick={() => setIssue(true)} className={`rounded px-2.5 py-1 text-[12.5px] font-medium ${issue ? 'bg-primary text-white' : 'text-muted hover:text-ink'}`}>Report missing or damaged goods</button>
          </div>
        </div>
        {issue && (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line bg-canvas/70 text-left text-[11px] uppercase tracking-wide text-muted"><th className="px-3 py-2">Product</th><th className="px-3 py-2 text-right">Delivered</th><th className="px-3 py-2">Received</th><th className="px-3 py-2">Damaged</th><th className="px-3 py-2">Note</th></tr>
              </thead>
              <tbody>
                {d.items.map((it) => {
                  const l = lines.find((x) => x.itemNo === it.itemNo)!
                  return (
                    <tr key={it.itemNo} className="border-b border-line last:border-0">
                      <td className="px-3 py-1.5">{it.description}</td>
                      <td className="px-3 py-1.5 text-right tabular">{num(it.qty)}</td>
                      <td className="px-3 py-1.5"><input type="number" min={0} max={it.qty} aria-label={`Received quantity of ${it.description}`} className="input h-8 w-24" value={l.receivedQty} onChange={(e) => set(it.itemNo, { receivedQty: Number(e.target.value) })} /></td>
                      <td className="px-3 py-1.5"><input type="number" min={0} max={l.receivedQty} aria-label={`Damaged quantity of ${it.description}`} className="input h-8 w-24" value={l.damagedQty} onChange={(e) => set(it.itemNo, { damagedQty: Number(e.target.value) })} /></td>
                      <td className="px-3 py-1.5"><input aria-label={`Note for ${it.description}`} className="input h-8 min-w-40" value={l.note} onChange={(e) => set(it.itemNo, { note: e.target.value })} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <TextareaField label={issue ? 'Describe the discrepancy' : 'Remarks (optional)'} required={issue} rows={2} value={remarks} onChange={(e) => { setRemarks(e.target.value); setError(undefined) }} />
        {error && <p role="alert" className="text-xs font-medium text-danger-700">{error}</p>}
        <Button size="sm" icon={<CheckCircle2 className="size-4" />} onClick={() => { setError(undefined); setReview(true) }}>Confirm goods received</Button>
      </CardBody>
      <Dialog
        open={review}
        onClose={() => setReview(false)}
        size="sm"
        title={`Confirm receipt of ${d.deliveryNumber}?`}
        description={hasDiscrepancy ? 'You are reporting a discrepancy. Our operations team and your account manager will follow up.' : 'You confirm that all goods in this delivery arrived in good condition.'}
        footer={<><Button variant="secondary" onClick={() => setReview(false)}>Back</Button><Button loading={busy} onClick={submit}>Confirm receipt</Button></>}
      >
        <ul className="space-y-1 text-[13px]">
          {d.items.map((it) => {
            const l = effective.find((x) => x.itemNo === it.itemNo)!
            return <li key={it.itemNo} className="flex justify-between gap-3"><span>{it.description}</span><span className="tabular">{num(l.receivedQty)} / {num(it.qty)}{l.damagedQty ? ` · ${l.damagedQty} damaged` : ''}</span></li>
          })}
        </ul>
        <p className="mt-3 text-xs text-muted">Received on {date(new Date(receivedOn).toISOString())}. This is an acknowledgement in TradeFlow; it is not an SAP goods receipt.</p>
      </Dialog>
    </Card>
  )
}

function ReceiptRecord({ ack }: { ack: GoodsReceiptAck }) {
  const { can, resolveReceiptDiscrepancy } = useStore()
  const lookups = useLookups()
  const toast = useToast()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()
  const open = ack.discrepancy?.status === 'Open'
  return (
    <Card>
      <CardHeader title={`Receipt confirmed · ${ack.ref}`} description={`${lookups.user(ack.confirmedById)?.name ?? '—'} · ${dateTime(ack.confirmedAt)} · received ${date(ack.receivedOn)}`} actions={<StatusBadge status={open ? 'Discrepancy open' : ack.outcome} />} />
      <CardBody className="space-y-3 text-[13px]">
        <ul className="divide-y divide-line rounded-md border border-line">
          {ack.lines.map((l) => (
            <li key={l.itemNo} className="flex flex-wrap justify-between gap-2 px-3 py-1.5">
              <span>{l.description}{l.note && <span className="block text-xs text-muted">{l.note}</span>}</span>
              <span className={`tabular ${l.receivedQty < l.deliveredQty || l.damagedQty ? 'font-medium text-warning-700' : ''}`}>received {num(l.receivedQty)} of {num(l.deliveredQty)}{l.damagedQty ? ` · ${num(l.damagedQty)} damaged` : ''}</span>
            </li>
          ))}
        </ul>
        {ack.remarks && <p><span className="text-muted">Remarks: </span>{ack.remarks}</p>}
        <p className="text-xs text-muted">SAP update: {ack.sapUpdate}.</p>
        {ack.discrepancy && (
          <Notice tone={open ? 'warning' : 'success'} icon={<AlertTriangle className="size-4" />} title={open ? `Discrepancy routed to ${ack.discrepancy.routedTo}` : `Discrepancy resolved by ${lookups.user(ack.discrepancy.resolvedById)?.name ?? '—'} · ${date(ack.discrepancy.resolvedAt)}`}>
            {ack.discrepancy.resolution ?? 'Awaiting follow-up by our team.'}
          </Notice>
        )}
        {open && can('delivery.resolve_discrepancy') && (
          <div className="space-y-2 border-t border-line pt-3">
            <TextareaField label="Resolution" required rows={2} value={note} error={error} hint={`At least ${MIN_REMARK} characters · shared with the customer`} onChange={(e) => { setNote(e.target.value); setError(undefined) }} />
            <Button size="sm" variant="secondary" onClick={async () => { const r = await resolveReceiptDiscrepancy(ack.id, note); if (!r.ok) return setError(r.error); toast.success('Discrepancy resolved', 'The customer has been notified.') }}>Mark resolved</Button>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
