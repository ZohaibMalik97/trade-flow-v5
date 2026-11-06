import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Check, CheckCircle2, Circle, Clock, MapPin, PackageCheck } from 'lucide-react'
import { useLookups, useStore } from '@/app/store'
import { useScope } from '@/hooks/useScope'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/misc'
import { useToast } from '@/components/ui/Toast'
import { SHIPMENT_FLOW } from '@/types/domain'
import { cn } from '@/utils/cn'
import { date, num } from '@/utils/format'

export default function CollectionPage() {
  const scope = useScope()
  const { state, can, advanceShipment } = useStore()
  const lookups = useLookups()
  const toast = useToast()
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const ready = scope.shipments.filter((s) => s.status === 'Ready for Collection')
  const upcoming = scope.shipments.filter((s) => ['Payment Verified', 'Ready for Warehouse Preparation', 'Documents in Progress'].includes(s.status))
  const collected = scope.shipments.filter((s) => s.status === 'Collected')

  return (
    <>
      <PageHeader title="Collection readiness" description="Goods, documents and references needed before a forwarder can collect." breadcrumbs={[{ label: 'Fulfillment' }, { label: 'Collection Readiness' }]} />

      <h2 className="mb-3 text-[15px] font-semibold">Ready for collection <span className="text-muted">({ready.length})</span></h2>
      {ready.length === 0 ? (
        <div className="card mb-8"><EmptyState icon={<PackageCheck className="size-5" />} title="Nothing ready yet" description="Orders appear here once goods are packed and documents are final." /></div>
      ) : (
        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          {ready.map((s) => {
            const docs = state.documents.filter((d) => d.linkedTo.id === s.id)
            const checklist = [
              ['Payment verified', true],
              ['Goods packed & staged', true],
              ['Packing list final', docs.some((d) => d.type === 'Packing List' && d.status === 'Final')],
              ['Commercial invoice final', docs.some((d) => d.type === 'Commercial Invoice' && d.status === 'Final')],
              ['Certificate of origin', docs.some((d) => d.type === 'Certificate of Origin')],
            ] as const
            return (
              <Card key={s.id}>
                <div className="flex items-start justify-between gap-4 border-b border-line p-5">
                  <div>
                    <p className="text-xs text-muted">{lookups.customer(s.customerId)?.name}</p>
                    <Link to={`/app/shipments/${s.id}`} className="font-mono text-lg font-semibold hover:text-primary">{s.collectionRef}</Link>
                    <p className="text-xs text-muted">{s.ref} · {lookups.request(s.requestId)?.ref}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <div className="grid gap-5 p-5 sm:grid-cols-2">
                  <div className="space-y-2 text-[13px]">
                    <p className="flex items-center gap-2"><MapPin className="size-4 text-muted" />{s.warehouse}</p>
                    <p className="flex items-center gap-2"><Clock className="size-4 text-muted" />{s.collectionWindow}</p>
                    <p className="flex items-center gap-2"><CalendarDays className="size-4 text-muted" />Ready since {date(s.history.at(-1)?.at)}</p>
                    <p className="text-xs text-muted">{s.cartons} cartons · {num(s.grossWeightKg)} kg · {s.volumeCbm} m³</p>
                  </div>
                  <ul className="space-y-1.5 text-[13px]">
                    {checklist.map(([l, ok]) => (
                      <li key={l} className={cn('flex items-center gap-2', !ok && 'text-muted')}>
                        {ok ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4" />} {l}
                      </li>
                    ))}
                  </ul>
                </div>
                {can('shipment.update') && (
                  <div className="flex justify-end border-t border-line px-5 py-3">
                    <Button size="sm" icon={<Check className="size-4" />} onClick={() => setConfirmId(s.id)}>Confirm collected</Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Coming up" description="In warehouse preparation" />
          <ul className="divide-y divide-line">
            {upcoming.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-muted">No orders in preparation.</li>}
            {upcoming.map((s) => (
              <li key={s.id}>
                <Link to={`/app/shipments/${s.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-canvas">
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[13px] font-medium">{s.ref}</span>
                    <span className="block text-xs text-muted">{lookups.customer(s.customerId)?.name}</span>
                  </span>
                  <span className="text-xs text-muted">Step {SHIPMENT_FLOW.indexOf(s.status) + 1}/7</span>
                  <StatusBadge status={s.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recently collected" />
          <ul className="divide-y divide-line">
            {collected.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-muted">None yet.</li>}
            {collected.map((s) => (
              <li key={s.id}>
                <Link to={`/app/shipments/${s.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-canvas">
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[13px] font-medium">{s.ref}</span>
                    <span className="block text-xs text-muted">{lookups.customer(s.customerId)?.name} · {s.collectionRef}</span>
                  </span>
                  <span className="text-xs text-muted">{date(s.history.at(-1)?.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <ConfirmDialog
        open={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={async () => { const res = await advanceShipment(confirmId!, 'Collected by forwarder (confirmed at gate)'); setConfirmId(null); if (!res.ok) return toast.error('Not updated', res.error); toast.success('Marked as collected') }}
        title="Confirm goods collected?"
        description="The order is closed and the customer is notified in-app."
        confirmLabel="Confirm collected"
      />
    </>
  )
}
