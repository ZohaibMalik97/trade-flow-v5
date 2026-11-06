import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Eye,
  FileText,
  FlaskConical,
  Gift,
  Mail,
  MessageSquarePlus,
  Pencil,
  Receipt,
  RotateCcw,
  Truck,
  Undo2,
  X,
  XCircle,
} from 'lucide-react'
import { canActOn, MIN_REMARK, pendingStep, requestTotal, useLookups, useStore, type ApprovalDecision } from '@/app/store'
import { useScope } from '@/hooks/useScope'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DemoTag, StatusBadge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { Tabs } from '@/components/ui/Tabs'
import { EmptyState, KeyValue, Notice } from '@/components/ui/misc'
import { TextareaField } from '@/components/forms/Field'
import { ActivityTimeline, ProgressSteps } from '@/components/data-display/Timeline'
import { lifecycleSteps } from '@/pages/sap/SalesOrderDetailPage'
import { useSapQuery } from '@/hooks/useSap'
import { services } from '@/services'
import { ApprovalChain, SlaIndicator } from '@/components/data-display/ApprovalChain'
import { DocumentPreview } from '@/components/data-display/DocumentPreview'
import { useToast } from '@/components/ui/Toast'
import { ProductImage } from '@/components/data-display/ProductImage'
import { SapSubmissionPanel } from '@/components/orders/SapSubmissionPanel'
import { SAP_MODE_LABEL } from '@/services'
import { cn } from '@/utils/cn'
import { brands } from '@/data/reference'
import { toUsd } from '@/utils/fx'
import { date, dateTime, fileSize, money, num } from '@/utils/format'
import type { DocumentRecord } from '@/types/domain'

type TabKey = 'lines' | 'approvals' | 'activity' | 'documents'

export default function RequestDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const fromWorkbench = location.pathname.startsWith('/app/approvals')
  const { state, user, can, decideApproval, cancelRequest, addRequestComment, issueInvoice } = useStore()
  const scope = useScope()
  const lookups = useLookups()
  const toast = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabKey>(fromWorkbench ? 'lines' : 'lines')
  const [decision, setDecision] = useState<ApprovalDecision | null>(null)
  const [comment, setComment] = useState('')
  const [commentError, setCommentError] = useState<string>()
  const [newComment, setNewComment] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmInvoice, setConfirmInvoice] = useState(false)
  const [preview, setPreview] = useState<DocumentRecord | null>(null)
  const [internalNote, setInternalNote] = useState(false)
  const soNumber = state.requests.find((x) => x.id === id)?.sap?.documentNumber
  // The SAP side (order status, deliveries, invoices) is read live from SAP, never from TradeFlow fields.
  const sapOrder = useSapQuery((ctx) => (soNumber ? services.sapData.getSalesOrder(ctx, soNumber) : Promise.resolve(undefined)), [soNumber])

  const r = state.requests.find((x) => x.id === id && (scope.customerIds.has(x.customerId) || canActOn(state, user, x)))
  if (!r)
    return (
      <div className="card">
        <EmptyState icon={<ClipboardList className="size-5" />} title="Request not available" description="It may not exist or be outside this role’s scope." action={<ButtonLink to={fromWorkbench ? '/app/approvals' : '/app/requests'} variant="secondary">Back</ButtonLink>} />
      </div>
    )

  const customer = lookups.customer(r.customerId)!
  const step = pendingStep(r)
  const actionable = canActOn(state, user, r)
  const total = requestTotal(r)
  const units = r.lines.reduce((s, l) => s + l.quantity, 0)
  const invoice = lookups.invoice(r.invoiceId)
  const shipment = lookups.shipment(r.shipmentId)
  const docs = state.documents.filter((d) => (invoice && d.linkedTo.id === invoice.id) || (shipment && d.linkedTo.id === shipment.id))
  const nameOf = (uid: string) => lookups.user(uid)?.name ?? 'System'
  const changeStep = r.approvalSteps.find((s) => s.status === 'Returned for Clarification' || s.status === 'Rejected')
  const isOwnerSide = can('order.create') || can('order.create_on_behalf')
  const stepIdx = step ? r.approvalSteps.indexOf(step) : -1
  const prevStep = stepIdx > 0 ? r.approvalSteps[stepIdx - 1] : undefined
  const external = user.kind === 'external'
  const extraCols = (external ? 0 : 1) + (r.sap?.confirmedQty ? 1 : 0)

  const submitDecision = async () => {
    if (!decision) return
    if (decision !== 'approve' && comment.trim().length < MIN_REMARK) return setCommentError(`Please enter at least ${MIN_REMARK} characters.`)
    const res = await decideApproval(r.id, decision, comment.trim())
    if (!res.ok) return setCommentError(res.error)
    toast.success(
      decision === 'approve' ? (res.finalApproved ? 'Request approved internally' : `Approved at ${step?.stage} stage`) : decision === 'reject' ? 'Request rejected' : decision === 'return_previous' ? `Returned to ${prevStep?.stage}` : 'Returned for clarification',
      res.finalApproved ? (res.sapQueued ? 'Approval recorded. The SAP sales order is queued and created in the background — follow its status in the SAP panel.' : 'Approval recorded. SAP order creation has its own status — submit or retry it from the SAP panel.') : 'Decision recorded with your name and time.',
    )
    setDecision(null)
    setComment('')
    if (fromWorkbench) navigate('/app/approvals')
  }
  const isFinalLevel = !!step && r.approvalSteps.indexOf(step) === r.approvalSteps.length - 1

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{r.ref}</span>}
        meta={<span className="flex flex-wrap gap-1.5"><StatusBadge status={r.status} />{r.status === 'Approved' && r.sap && <StatusBadge status={r.sap.status} />}</span>}
        description={<>{customer.name} · {lookups.territory(r.territoryId)?.name} · created {dateTime(r.createdAt)} by {nameOf(r.createdById)}</>}
        breadcrumbs={fromWorkbench ? [{ label: 'Request Approvals', to: '/app/approvals' }, { label: r.ref }] : [{ label: 'Sales Requests', to: '/app/requests' }, { label: r.ref }]}
        actions={
          <>
            <Button variant="secondary" icon={<Mail className="size-4" />} onClick={() => navigate(`/app/email?compose=${r.customerId}&request=${r.id}`)}>Email</Button>
            {isOwnerSide && r.status === 'Returned for Clarification' && <ButtonLink to={`/app/requests/new?from=${r.id}`} icon={<Pencil className="size-4" />}>Revise request</ButtonLink>}
            {isOwnerSide && r.status === 'Draft' && <ButtonLink to={`/app/requests/new?from=${r.id}`} icon={<Pencil className="size-4" />}>Continue draft</ButtonLink>}
            {isOwnerSide && ['Pending Approval', 'Returned for Clarification', 'Draft'].includes(r.status) && (
              <Button variant="ghost" className="text-danger-700" icon={<XCircle className="size-4" />} onClick={() => setConfirmCancel(true)}>Cancel</Button>
            )}
            {can('invoice.issue') && r.status === 'Approved' && !r.invoiceId && r.sap?.documentNumber && <Button icon={<Receipt className="size-4" />} onClick={() => setConfirmInvoice(true)}>Issue proforma invoice</Button>}
            {invoice && <ButtonLink to={`/app/invoices/${invoice.id}`} variant="secondary" icon={<Receipt className="size-4" />}>{invoice.number}</ButtonLink>}
            {shipment && can('shipment.view') && <ButtonLink to={`/app/shipments/${shipment.id}`} variant="secondary" icon={<Truck className="size-4" />}>{shipment.ref}</ButtonLink>}
          </>
        }
      />

      {changeStep && ['Returned for Clarification', 'Rejected'].includes(r.status) && (
        <Notice tone={r.status === 'Rejected' ? 'danger' : 'warning'} icon={<AlertTriangle className="size-4" />} className="mb-4" title={`${r.status} by ${nameOf(changeStep.actedById ?? changeStep.approverId)} (${changeStep.stage})`}>
          {changeStep.comment}
        </Notice>
      )}

      <Card className="mb-4">
        <CardBody>
          <ProgressSteps steps={lifecycleSteps(sapOrder.data?.order, r, sapOrder.data?.deliveries ?? [], sapOrder.data?.invoices ?? [], state.goodsReceipts)} />
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          {actionable && step && (
            <Card className="border-primary/30 ring-1 ring-primary/10">
              <CardHeader
                title={`Your decision · ${step.stage}`}
                description={`Level ${r.approvalSteps.indexOf(step) + 1} of ${r.approvalSteps.length} · SLA ${step.slaHours}h`}
                actions={<SlaIndicator step={step} />}
              />
              <CardBody className="space-y-4">
                <div className="grid gap-3 text-[13px] sm:grid-cols-3">
                  <div className="rounded-lg bg-canvas p-3"><p className="text-xs text-muted">Request value</p><p className="mt-0.5 font-semibold tabular">{money(total, r.currency)}</p><p className="text-[11px] text-muted">≈ {money(toUsd(total, r.currency), 'USD', { compact: true })}</p></div>
                  <div className="rounded-lg bg-canvas p-3"><p className="text-xs text-muted">Units · lines</p><p className="mt-0.5 font-semibold tabular">{num(units)} · {r.lines.length}</p><p className="text-[11px] text-muted">{r.promo.testers} testers, {r.promo.samples} samples</p></div>
                  <div className="rounded-lg bg-canvas p-3"><p className="text-xs text-muted">Customer credit limit</p><p className="mt-0.5 font-semibold tabular">{money(customer.creditLimit, 'USD', { compact: true })}</p><p className="text-[11px] text-muted">{customer.paymentTerms}</p></div>
                </div>
                {r.notes && <Notice tone="info" title="Requester notes">{r.notes}</Notice>}
                <div className="flex flex-wrap gap-2">
                  {can('order.approve') && <Button variant="success" icon={<Check className="size-4" />} onClick={() => setDecision('approve')}>Approve</Button>}
                  {can('order.return_to_requester') && <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => setDecision('changes')}>Return to requester</Button>}
                  {can('order.return_to_previous_approver') && (
                    <span title={prevStep ? undefined : 'This is the first approval level — there is no previous approver.'}>
                      <Button variant="secondary" icon={<Undo2 className="size-4" />} disabled={!prevStep} onClick={() => setDecision('return_previous')}>Return to previous approver</Button>
                    </span>
                  )}
                  {can('order.reject') && <Button variant="secondary" className="text-danger-700" icon={<X className="size-4" />} onClick={() => setDecision('reject')}>Reject</Button>}
                </div>
              </CardBody>
            </Card>
          )}
          {!actionable && fromWorkbench && step && (
            <Notice tone="info">This request is at the <strong>{step.stage}</strong> stage, assigned to {nameOf(step.approverId)}. Only that approver can act on it — you have read-only access.</Notice>
          )}

          <Card>
            <Tabs
              className="px-3"
              value={tab}
              onChange={setTab}
              items={[
                { key: 'lines', label: 'Line items', count: r.lines.length },
                { key: 'approvals', label: 'Approval history' },
                { key: 'activity', label: 'Activity & comments', count: r.activity.length },
                { key: 'documents', label: 'Documents', count: docs.length },
              ]}
            />
            {tab === 'lines' && (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-line bg-canvas/70 text-left text-[11px] uppercase tracking-wide text-muted">
                      <th className="px-5 py-2.5">Product</th>
                      <th className="px-3 py-2.5">Brand</th>
                      <th className="px-3 py-2.5 text-right">Requested qty</th>
                      {!external && <th className="px-3 py-2.5 text-right" title="Current available stock (demo data — not live SAP stock)">Available now</th>}
                      {r.sap?.confirmedQty && <th className="px-3 py-2.5 text-right">SAP confirmed</th>}
                      <th className="px-3 py-2.5 text-right">Unit price</th>
                      <th className="px-5 py-2.5 text-right">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.lines.map((l) => {
                      const p = lookups.product(l.productId)!
                      return (
                        <tr key={l.productId} className="border-b border-line">
                          <td className="px-5 py-3"><div className="flex items-center gap-3"><ProductImage product={p} size="sm" /><span><span className="font-medium">{p.name}</span><span className="block font-mono text-[11px] text-muted">{p.sku} · {p.category}</span></span></div></td>
                          <td className="px-3 py-3 text-muted">{brands.find((b) => b.id === p.brandId)?.name}</td>
                          <td className="px-3 py-3 text-right tabular">{num(l.quantity)} <span className="text-[11px] text-muted">{p.uom}</span></td>
                          {!external && (
                            <td className={cn('px-3 py-3 text-right tabular', l.quantity > p.availableQty && !r.sap?.documentNumber && 'font-medium text-warning-700')}>
                              {num(p.availableQty)}
                              {l.quantity > p.availableQty && !r.sap?.documentNumber && <span className="block text-[11px]">exceeds stock</span>}
                            </td>
                          )}
                          {r.sap?.confirmedQty && <td className={cn('px-3 py-3 text-right tabular', (r.sap.confirmedQty[l.productId] ?? 0) < l.quantity && 'text-warning-700')}>{num(r.sap.confirmedQty[l.productId] ?? 0)}</td>}
                          <td className="px-3 py-3 text-right tabular">{money(l.unitPrice, r.currency)}</td>
                          <td className="px-5 py-3 text-right font-medium tabular">{money(l.unitPrice * l.quantity, r.currency)}</td>
                        </tr>
                      )
                    })}
                    <tr className="border-b border-line bg-primary-50/30">
                      <td className="px-5 py-3" colSpan={2}><span className="inline-flex items-center gap-1.5 font-medium text-primary-700"><Gift className="size-4" />Testers (free of charge)</span></td>
                      <td className="px-3 py-3 text-right tabular">{num(r.promo.testers)}</td>
                      {extraCols > 0 && <td colSpan={extraCols} />}
                      <td className="px-3 py-3 text-right text-muted">—</td>
                      <td className="px-5 py-3 text-right"><DemoTag>Illustrative</DemoTag></td>
                    </tr>
                    <tr className="border-b border-line bg-primary-50/30">
                      <td className="px-5 py-3" colSpan={2}><span className="inline-flex items-center gap-1.5 font-medium text-primary-700"><Gift className="size-4" />Samples {state.promoRules.sampleSizeMl} ml (free of charge)</span></td>
                      <td className="px-3 py-3 text-right tabular">{num(r.promo.samples)}</td>
                      {extraCols > 0 && <td colSpan={extraCols} />}
                      <td className="px-3 py-3 text-right text-muted">—</td>
                      <td className="px-5 py-3 text-right text-xs text-muted">{num(r.promo.eligibleUnits)} eligible units</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4 + extraCols} className="px-5 py-3 text-right text-muted">Total ({num(units)} units)</td>
                      <td className="px-5 py-3 text-right text-base font-semibold tabular">{money(total, r.currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {tab === 'approvals' && <div className="p-5"><ApprovalChain steps={r.approvalSteps} /></div>}
            {tab === 'activity' && (
              <div className="space-y-4 p-5">
                {can('order.comment') && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <TextareaField aria-label="Add a comment" placeholder={external ? 'Add a comment for our sales team…' : 'Add a comment…'} rows={2} value={newComment} onChange={(e) => setNewComment(e.target.value)} className="min-h-0" />
                    <div className="flex flex-col gap-1.5">
                      <Button
                        variant="secondary"
                        icon={<MessageSquarePlus className="size-4" />}
                        disabled={!newComment.trim()}
                        onClick={async () => {
                          const res = await addRequestComment(r.id, newComment.trim(), internalNote)
                          if (!res.ok) return toast.error('Comment not added', res.error)
                          setNewComment('')
                          toast.success(internalNote ? 'Internal comment added' : 'Comment added', internalNote ? 'Visible to staff only.' : 'Visible to the customer and staff.')
                        }}
                      >
                        Comment
                      </Button>
                      {!external && <label className="flex items-center gap-1.5 text-[12px] text-muted"><input type="checkbox" checked={internalNote} onChange={(e) => setInternalNote(e.target.checked)} />Internal only</label>}
                    </div>
                  </div>
                )}
                <ActivityTimeline entries={external ? r.activity.filter((a) => !a.internal) : r.activity.map((a) => (a.internal ? { ...a, action: `${a.action} (internal)` } : a))} nameOf={nameOf} />
              </div>
            )}
            {tab === 'documents' && (
              <ul className="divide-y divide-line">
                {docs.length === 0 && <li><EmptyState icon={<FileText className="size-5" />} title="No documents yet" description="Proforma invoice and shipping documents appear here as the order progresses." /></li>}
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                    <FileText className="size-4 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{d.name}</span>
                      <span className="block text-xs text-muted">{d.type} · {fileSize(d.sizeKb)} · {date(d.uploadedAt)}</span>
                    </span>
                    <StatusBadge status={d.status} />
                    <Button size="sm" variant="ghost" icon={<Eye className="size-4" />} onClick={() => setPreview(d)}>Preview</Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Request details" />
            <CardBody>
              <KeyValue
                cols={1}
                items={[
                  { label: 'Customer', value: user.kind === 'external' ? customer.name : <Link to={`/app/customers/${customer.id}`} className="text-primary hover:underline">{customer.name}</Link> },
                  { label: 'Fulfilment', value: r.fulfilment === 'Collection' ? `Collection · ${r.collectionWarehouse}` : `Delivery · ${r.deliveryAddress?.line1}, ${r.deliveryAddress?.city}` },
                  { label: 'Requested ready date', value: date(r.requestedDate) },
                  { label: 'Customer PO', value: r.customerPo ?? '—' },
                  { label: 'Currency', value: r.currency },
                  { label: 'SAP sales document', value: r.sap?.documentNumber ? <span className="font-mono">{r.sap.documentNumber}</span> : r.sap ? 'Not created yet' : 'Created only after approval and SAP submission' },
                ]}
              />
            </CardBody>
          </Card>
          <SapSubmissionPanel request={r} sapOrder={sapOrder.data?.order} sapError={sapOrder.error?.message} />
          <Card>
            <CardHeader title="Value" />
            <CardBody className="space-y-2 text-[13px]">
              <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="font-medium tabular">{money(total, r.currency)}</span></div>
              {invoice && <div className="flex justify-between"><span className="text-muted">Freight</span><span className="tabular">{money(invoice.freight, r.currency)}</span></div>}
              <div className="flex justify-between border-t border-line pt-2"><span className="font-medium">Total</span><span className="text-base font-semibold tabular">{money(invoice?.total ?? total, r.currency)}</span></div>
              <p className="text-xs text-muted">≈ {money(toUsd(invoice?.total ?? total, r.currency), 'USD')} at illustrative FX</p>
            </CardBody>
          </Card>
          <p className="flex items-start gap-1.5 text-xs text-muted"><FlaskConical className="mt-0.5 size-3.5 shrink-0" /> Approvals and proformas are recorded on the server with your name and time. SAP data shows its source on each panel.</p>
        </div>
      </div>

      <Dialog
        open={!!decision}
        onClose={() => { setDecision(null); setCommentError(undefined) }}
        title={decision === 'approve' ? `Approve ${r.ref}?` : decision === 'reject' ? `Reject ${r.ref}?` : decision === 'return_previous' ? `Return ${r.ref} to ${prevStep?.stage}` : `Return ${r.ref} to the requester`}
        description={decision === 'approve' ? (isFinalLevel ? 'This is the final internal approval level. Approval is recorded first; the SAP sales order is then created as a separate step.' : `It will move to ${r.approvalSteps[r.approvalSteps.indexOf(step!) + 1]?.stage}.`) : decision === 'return_previous' ? `It goes back to ${nameOf(prevStep?.approverId ?? '')} (${prevStep?.stage}) with your findings. Their earlier decision is kept in the approval history.` : decision === 'reject' ? 'Rejection is final. The requester is notified with your reason.' : 'The requester can revise and resubmit. They are notified with your comment.'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecision(null)}>Cancel</Button>
            <Button variant={decision === 'approve' ? 'success' : decision === 'reject' ? 'danger' : 'primary'} onClick={submitDecision}>
              {decision === 'approve' ? 'Approve' : decision === 'reject' ? 'Reject request' : decision === 'return_previous' ? 'Return to approver' : 'Return to requester'}
            </Button>
          </>
        }
      >
        <TextareaField
          label={decision === 'approve' ? 'Comment (optional)' : decision === 'return_previous' ? 'Findings for the previous approver' : decision === 'reject' ? 'Reason for rejection' : 'What should the requester change?'}
          required={decision !== 'approve'}
          value={comment}
          error={commentError}
          onChange={(e) => { setComment(e.target.value); setCommentError(undefined) }}
          rows={3}
        />
        {decision === 'approve' && isFinalLevel && (
          <p className="mt-3 rounded-md bg-canvas px-3 py-2 text-xs text-muted">After approval TradeFlow requests the sales order from SAP ({SAP_MODE_LABEL}). The SAP result is shown separately; if it fails the approval stays and the order can be retried without creating a duplicate.</p>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><FlaskConical className="size-3.5" />Recorded as {user.name} · {dateTime(new Date().toISOString())}</p>
      </Dialog>
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={async () => { const res = await cancelRequest(r.id, 'Cancelled by requester'); setConfirmCancel(false); if (!res.ok) return toast.error('Not cancelled', res.error); toast.info(`${r.ref} cancelled`) }}
        title={`Cancel ${r.ref}?`}
        description="Approvers will no longer see this request. This cannot be undone."
        confirmLabel="Cancel request"
        tone="danger"
      />
      <ConfirmDialog
        open={confirmInvoice}
        onClose={() => setConfirmInvoice(false)}
        onConfirm={async () => { const res = await issueInvoice(r.id); setConfirmInvoice(false); if (!res.ok) return toast.error('Proforma not issued', res.error); toast.success('Proforma invoice issued', 'The customer has been notified.') }}
        title="Issue proforma invoice?"
        description={`${money(total, r.currency)}${r.fulfilment === 'Delivery' ? ' + 2.5% illustrative freight' : ''} · payment due in 7 days.`}
        confirmLabel="Issue invoice"
      />
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
    </>
  )
}
