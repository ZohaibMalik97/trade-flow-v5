import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Box, Check, Copy, Eye, FileText, FlaskConical, Lock, MapPin, PackageCheck, Truck, Upload } from 'lucide-react'
import { useLookups, useStore } from '@/app/store'
import { useScope } from '@/hooks/useScope'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DemoTag, StatusBadge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState, KeyValue, Notice } from '@/components/ui/misc'
import { SelectField, TextareaField } from '@/components/forms/Field'
import { FileDrop, type LocalFile } from '@/components/forms/FileDrop'
import { DocumentPreview } from '@/components/data-display/DocumentPreview'
import { useToast } from '@/components/ui/Toast'
import { SHIPMENT_FLOW, type DocumentRecord, type DocumentType } from '@/types/domain'
import { cn } from '@/utils/cn'
import { date, dateTime, fileSize, num } from '@/utils/format'

const HINT: Partial<Record<(typeof SHIPMENT_FLOW)[number], string>> = {
  Approved: 'Waiting for Finance to issue the proforma invoice.',
  'Awaiting Payment': 'Waiting for the customer’s payment and Finance verification.',
  'Payment Verified': 'Ready to release to the warehouse for picking and packing.',
  'Ready for Warehouse Preparation': 'Picking & packing in progress — next, prepare shipping documents.',
  'Documents in Progress': 'Finalise packing list, commercial invoice and certificate of origin.',
  'Ready for Collection': 'Waiting for the customer’s forwarder to collect.',
}

export default function ShipmentDetailPage() {
  const { id } = useParams()
  const { state, can, advanceShipment, addDocument } = useStore()
  const scope = useScope()
  const lookups = useLookups()
  const toast = useToast()
  const [advanceOpen, setAdvanceOpen] = useState(false)
  const [note, setNote] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [files, setFiles] = useState<LocalFile[]>([])
  const [docType, setDocType] = useState<DocumentType>('Bill of Lading')
  const [preview, setPreview] = useState<DocumentRecord | null>(null)

  const s = scope.shipments.find((x) => x.id === id)
  if (!s) return <div className="card"><EmptyState icon={<Truck className="size-5" />} title="Shipment not available" action={<ButtonLink to="/app/shipments" variant="secondary">Back</ButtonLink>} /></div>

  const req = lookups.request(s.requestId)!
  const customer = lookups.customer(s.customerId)!
  const idx = SHIPMENT_FLOW.indexOf(s.status)
  const next = SHIPMENT_FLOW[idx + 1]
  const canAdvance = can('shipment.update') && idx >= SHIPMENT_FLOW.indexOf('Payment Verified') && !!next
  const docs = state.documents.filter((d) => d.linkedTo.kind === 'shipment' && d.linkedTo.id === s.id)
  const reached = (st: (typeof SHIPMENT_FLOW)[number]) => s.history.find((h) => h.status === st)

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{s.ref}</span>}
        meta={<StatusBadge status={s.status} />}
        description={<>{customer.name} · <Link className="font-mono text-primary hover:underline" to={`/app/requests/${req.id}`}>{req.ref}</Link> · {s.mode}</>}
        breadcrumbs={[{ label: 'Warehouse coordination', to: '/app/shipments' }, { label: s.ref }]}
        actions={
          <>
            {can('shipment.update') && can('document.upload') && <Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => setUploadOpen(true)}>Add document</Button>}
            {canAdvance && <Button icon={<ArrowRight className="size-4" />} onClick={() => setAdvanceOpen(true)}>Move to “{next}”</Button>}
          </>
        }
      />

      {s.status === 'Ready for Collection' && s.collectionRef && (
        <div className="mb-4 overflow-hidden rounded-lg bg-midnight text-white">
          <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex size-12 items-center justify-center rounded-lg bg-success/20 text-teal-300"><PackageCheck className="size-6" /></span>
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">Collection reference</p>
                <p className="font-mono text-2xl font-semibold tracking-wide">{s.collectionRef}</p>
              </div>
            </div>
            <div className="text-[13px] text-slate-300">
              <p className="flex items-center gap-2"><MapPin className="size-4" />{s.warehouse}</p>
              <p className="mt-1">{s.collectionWindow}</p>
            </div>
            <Button variant="secondary" className="border-white/15 bg-white/10 text-white hover:bg-white/20" icon={<Copy className="size-4" />} onClick={() => { navigator.clipboard?.writeText(s.collectionRef!).catch(() => undefined); toast.info('Collection reference copied') }}>Copy</Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Shipment timeline" description={HINT[s.status] ?? 'Completed.'} />
            <CardBody>
              <ol className="relative">
                {SHIPMENT_FLOW.map((st, i) => {
                  const h = reached(st)
                  const phase = i < idx ? 'done' : i === idx ? (st === 'Collected' ? 'done' : 'current') : 'upcoming'
                  return (
                    <li key={st} className="relative flex gap-4 pb-6 last:pb-0">
                      {i < SHIPMENT_FLOW.length - 1 && <span aria-hidden className={cn('absolute left-[13px] top-7 bottom-0 w-0.5', i < idx ? 'bg-success' : 'bg-line')} />}
                      <span className={cn('relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold', phase === 'done' && 'bg-success text-white', phase === 'current' && 'bg-primary text-white ring-4 ring-primary-100', phase === 'upcoming' && 'bg-slate-100 text-muted')}>
                        {phase === 'done' ? <Check className="size-4" /> : i + 1}
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className={cn('text-[13px] font-medium', phase === 'upcoming' && 'text-muted')}>{st}</p>
                          {h && <span className="text-xs text-muted">{dateTime(h.at)}</span>}
                        </div>
                        {h && <p className="text-xs text-muted">by {lookups.user(h.byId)?.name ?? 'System'}</p>}
                        {h?.note && <p className="mt-1 rounded-lg bg-canvas px-3 py-1.5 text-[13px]">{h.note}</p>}
                        {i <= 2 && phase === 'upcoming' && <p className="text-xs text-muted">Updated automatically by {i === 2 ? 'Finance' : 'the workflow'}</p>}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Packing list" description={`${s.cartons} cartons · ${num(s.grossWeightKg)} kg gross · ${s.volumeCbm} m³`} actions={<DemoTag>Indicative</DemoTag>} icon={<Box className="size-5" />} />
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-line bg-canvas/70 text-left text-[11px] uppercase tracking-wide text-muted"><th className="px-5 py-2">Item</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Units</th><th className="px-5 py-2 text-right">Cartons</th></tr></thead>
                <tbody>
                  {s.packing.map((p) => (
                    <tr key={p.productId} className="border-b border-line">
                      <td className="px-5 py-2.5"><span className="font-medium">{lookups.product(p.productId)?.name}</span><span className="block font-mono text-[11px] text-muted">{lookups.product(p.productId)?.sku}</span></td>
                      <td className="px-3 py-2.5 text-muted">{p.kind}</td>
                      <td className="px-3 py-2.5 text-right tabular">{num(p.quantity)}</td>
                      <td className="px-5 py-2.5 text-right tabular">{p.cartons}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-line bg-primary-50/30">
                    <td className="px-5 py-2.5 font-medium">Testers & samples</td>
                    <td className="px-3 py-2.5 text-muted">Free of charge</td>
                    <td className="px-3 py-2.5 text-right tabular">{num(req.promo.testers + req.promo.samples)}</td>
                    <td className="px-5 py-2.5 text-right tabular">1</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Logistics details" />
            <CardBody>
              <KeyValue
                cols={1}
                items={[
                  { label: 'Mode', value: s.mode },
                  { label: 'Warehouse', value: s.warehouse },
                  { label: 'Requested ready date', value: date(req.requestedDate) },
                  { label: 'Collection reference', value: s.collectionRef ?? <span className="inline-flex items-center gap-1 text-muted"><Lock className="size-3.5" /> Issued when ready</span> },
                  { label: 'Customer contact', value: customer.contacts.find((c) => c.primary)?.name },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Shipping documents" description={`${docs.length} file(s)`} />
            <ul className="divide-y divide-line">
              {docs.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-muted">Prepared at the “Documents in Progress” stage.</li>}
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                  <FileText className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{d.type}</span>
                    <span className="block truncate text-xs text-muted">{d.name}</span>
                  </span>
                  <StatusBadge status={d.status} />
                  <button type="button" aria-label={`Preview ${d.name}`} onClick={() => setPreview(d)} className="rounded p-1 text-muted hover:text-ink"><Eye className="size-4" /></button>
                </li>
              ))}
            </ul>
          </Card>
          {!canAdvance && idx < SHIPMENT_FLOW.indexOf('Payment Verified') && <Notice tone="info">Warehouse work starts once payment is verified by Finance.</Notice>}
        </div>
      </div>

      <Dialog
        open={advanceOpen}
        onClose={() => setAdvanceOpen(false)}
        title={`Move ${s.ref} to “${next}”?`}
        description={next === 'Ready for Collection' ? 'A collection reference is generated and the customer is notified in-app.' : next === 'Documents in Progress' ? 'Draft packing list, commercial invoice and certificate of origin are created.' : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdvanceOpen(false)}>Cancel</Button>
            <Button onClick={async () => { const res = await advanceShipment(s.id, note.trim()); if (!res.ok) return toast.error('Status not updated', res.error); setAdvanceOpen(false); setNote(''); toast.success(`Status updated: ${next}`) }}>Update status</Button>
          </>
        }
      >
        <TextareaField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. 14 pallets staged at bay 3" />
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><FlaskConical className="size-3.5" />No warehouse or ERP system is updated.</p>
      </Dialog>

      <Dialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Add shipping document"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button
              disabled={!files.length}
              onClick={async () => {
                for (const f of files) {
                  const res = await addDocument({ name: f.name, type: docType, sizeKb: f.sizeKb, file: f.file, linkedTo: { kind: 'shipment', id: s.id }, customerId: s.customerId, status: 'Final' })
                  if (!res.ok) return toast.error(`${f.name} not uploaded`, res.error)
                }
                setFiles([])
                setUploadOpen(false)
                toast.success('Document uploaded', 'Stored securely and linked to the shipment.')
              }}
            >
              Add
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField label="Document type" value={docType} onChange={(e) => setDocType(e.target.value as DocumentType)} options={(['Packing List', 'Commercial Invoice', 'Certificate of Origin', 'Bill of Lading', 'Safety Data Sheet'] as DocumentType[]).map((t) => ({ value: t, label: t }))} />
          <FileDrop files={files} onChange={setFiles} />
          {files.length > 0 && <p className="text-xs text-muted">{files.length} file(s) · {fileSize(files.reduce((a, f) => a + f.sizeKb, 0))}</p>}
        </div>
      </Dialog>
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
    </>
  )
}
