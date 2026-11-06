/** Customer visits, calls, meetings and follow-ups: list + "log activity" dialog. */
import { useState } from 'react'
import { CalendarCheck, CheckCircle2, MapPin, MessageSquare, Phone, Plus, Users } from 'lucide-react'
import { useLookups, useStore } from '@/app/store'
import { useScope } from '@/hooks/useScope'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/misc'
import { SelectField, TextareaField, TextField } from '@/components/forms/Field'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/utils/cn'
import { dateTime } from '@/utils/format'
import type { ActivityType, CustomerActivity } from '@/types/domain'

export const ACTIVITY_TYPES: ActivityType[] = ['Visit', 'Call', 'Meeting', 'Follow-up', 'Email']
const ICON: Record<ActivityType, typeof Phone> = { Visit: MapPin, Call: Phone, Meeting: Users, 'Follow-up': CalendarCheck, Email: MessageSquare }

export function ActivityList({ activities, showCustomer }: { activities: CustomerActivity[]; showCustomer?: boolean }) {
  const { user, can, updateActivity } = useStore()
  const lookups = useLookups()
  const toast = useToast()
  const [completing, setCompleting] = useState<CustomerActivity | null>(null)
  const [outcome, setOutcome] = useState('')
  const rows = [...activities].sort((a, b) => b.at.localeCompare(a.at))
  if (rows.length === 0) return <EmptyState icon={<CalendarCheck className="size-5" />} title="No visits or activities recorded" description="Visits, calls and follow-ups recorded by the sales team appear here." />
  return (
    <>
      <ul className="divide-y divide-line">
        {rows.map((a) => {
          const Icon = ICON[a.type]
          const overdue = a.status === 'Planned' && new Date(a.at).getTime() < Date.now()
          const mine = a.ownerId === user.id || can('activity.view_all')
          return (
            <li key={a.id} className="flex gap-3 px-5 py-3.5">
              <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ring-1', a.status === 'Completed' ? 'bg-success-50 text-success-700 ring-teal-100' : 'bg-primary-50 text-primary ring-primary-100')}>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-semibold">{a.subject}</p>
                  <Badge tone={a.status === 'Completed' ? 'success' : a.status === 'Cancelled' ? 'neutral' : overdue ? 'danger' : 'info'}>{overdue ? 'Overdue' : a.status}</Badge>
                  <Badge>{a.type}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {showCustomer && <>{lookups.customer(a.customerId)?.name} · </>}
                  {dateTime(a.at)} · {lookups.user(a.ownerId)?.name ?? '—'} · {lookups.territory(a.territoryId)?.name}
                </p>
                {a.notes && <p className="mt-1.5 text-[13px] text-ink/90">{a.notes}</p>}
                {a.outcome && <p className="mt-1 text-[13px]"><span className="font-medium">Outcome:</span> {a.outcome}</p>}
                {a.nextActionAt && <p className="mt-1 text-xs text-muted">Next action by {dateTime(a.nextActionAt)}</p>}
              </div>
              {a.status === 'Planned' && can('activity.manage') && mine && (
                <Button size="sm" variant="secondary" icon={<CheckCircle2 className="size-3.5" />} onClick={() => { setCompleting(a); setOutcome('') }}>
                  Complete
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <Dialog
        open={!!completing}
        onClose={() => setCompleting(null)}
        title="Complete activity"
        description={completing?.subject}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompleting(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                const r = await updateActivity(completing!.id, { status: 'Completed', outcome: outcome.trim() || undefined })
                if (!r.ok) return toast.error('Not saved', r.error)
                toast.success('Activity completed')
                setCompleting(null)
              }}
            >
              Mark completed
            </Button>
          </>
        }
      >
        <TextareaField label="Outcome" rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} hint="What was agreed or learned." />
      </Dialog>
    </>
  )
}

/** Button + dialog to record a visit / call / follow-up for a customer in the user's scope. */
export function LogActivityButton({ customerId, size = 'md' }: { customerId?: string; size?: 'sm' | 'md' }) {
  const { can, logActivity } = useStore()
  const scope = useScope()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const blank = () => ({ customerId: customerId ?? '', type: 'Visit' as ActivityType, subject: '', notes: '', outcome: '', at: new Date().toISOString().slice(0, 16), status: 'Completed' as CustomerActivity['status'], nextActionAt: '' })
  const [f, setF] = useState(blank)
  const [error, setError] = useState<string | null>(null)
  if (!can('activity.manage')) return null
  return (
    <>
      <Button size={size} icon={<Plus className="size-4" />} onClick={() => { setF(blank()); setError(null); setOpen(true) }}>Log visit / activity</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Log visit or activity"
        description="Recorded against the customer and its current territory."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!f.customerId) return setError('Select a customer.')
                const r = await logActivity({
                  customerId: f.customerId,
                  type: f.type,
                  subject: f.subject,
                  notes: f.notes.trim() || undefined,
                  outcome: f.status === 'Completed' ? f.outcome.trim() || undefined : undefined,
                  at: new Date(f.at).toISOString(),
                  status: f.status,
                  nextActionAt: f.nextActionAt ? new Date(f.nextActionAt).toISOString() : undefined,
                })
                if (!r.ok) return setError(r.error)
                toast.success('Activity recorded')
                setOpen(false)
              }}
            >
              Save activity
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {error && <p role="alert" className="text-[13px] font-medium text-danger-700 sm:col-span-2">{error}</p>}
          {!customerId && (
            <SelectField className="" label="Customer" required placeholder="Select customer…" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })} options={scope.customers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))} />
          )}
          <SelectField label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as ActivityType })} options={ACTIVITY_TYPES.map((t) => ({ value: t, label: t }))} />
          <SelectField label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as CustomerActivity['status'] })} options={[{ value: 'Completed', label: 'Completed' }, { value: 'Planned', label: 'Planned' }]} />
          <TextField label="Date & time" type="datetime-local" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} />
          <TextField label="Subject" required className="" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="e.g. Store visit — new range" />
          <div className="sm:col-span-2"><TextareaField label="Notes" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          {f.status === 'Completed' && <div className="sm:col-span-2"><TextField label="Outcome" value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })} /></div>}
          <TextField label="Next follow-up (optional)" type="datetime-local" value={f.nextActionAt} onChange={(e) => setF({ ...f, nextActionAt: e.target.value })} />
        </div>
      </Dialog>
    </>
  )
}
