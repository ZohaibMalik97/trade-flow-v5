import { Link } from 'react-router-dom'
import { CalendarCheck, CalendarClock, Check } from 'lucide-react'
import { useLookups, useStore } from '@/app/store'
import { useScope } from '@/hooks/useScope'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/misc'
import { useToast } from '@/components/ui/Toast'
import { date, relative } from '@/utils/format'
import type { EmailThread } from '@/types/domain'

export default function FollowUpsPage() {
  const scope = useScope()
  const { setFollowUp } = useStore()
  const lookups = useLookups()
  const toast = useToast()
  const open = scope.threads.filter((t) => ['Overdue', 'Due Today', 'Open'].includes(t.followUp.status))
  const done = scope.threads.filter((t) => t.followUp.status === 'Done')
  const groups: [string, EmailThread[]][] = [
    ['Overdue', open.filter((t) => t.followUp.status === 'Overdue')],
    ['Due today', open.filter((t) => t.followUp.status === 'Due Today')],
    ['Upcoming', open.filter((t) => t.followUp.status === 'Open')],
  ]

  const Row = ({ t }: { t: EmailThread }) => (
    <li className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <Link to={`/app/email?thread=${t.id}`} className="block truncate text-[13px] font-medium hover:text-primary">{t.subject}</Link>
        <p className="text-xs text-muted">
          {lookups.customer(t.customerId)?.name}
          {t.requestId && ` · ${lookups.request(t.requestId)?.ref}`}
          {t.followUp.note && ` — ${t.followUp.note}`}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted" title={date(t.followUp.dueAt)}>{t.followUp.dueAt ? `Due ${relative(t.followUp.dueAt)}` : ''}</span>
        <StatusBadge status={t.followUp.status} />
        {t.followUp.status !== 'Done' && (
          <Button size="xs" variant="secondary" icon={<Check className="size-3.5" />} onClick={async () => { const r = await setFollowUp(t.id, 'Done', t.followUp.dueAt, t.followUp.note); if (!r.ok) return toast.error('Not updated', r.error); toast.success('Follow-up completed') }}>Done</Button>
        )}
      </div>
    </li>
  )

  return (
    <>
      <PageHeader title="Follow-ups" description="Conversations that need a response or a chase." breadcrumbs={[{ label: 'Communication' }, { label: 'Follow-ups' }]} />
      {open.length === 0 ? (
        <div className="card mb-4"><EmptyState icon={<CalendarCheck className="size-5" />} title="All follow-ups handled" description="Set a follow-up from any email conversation." /></div>
      ) : (
        <div className="mb-4 space-y-4">
          {groups.filter(([, xs]) => xs.length).map(([label, xs]) => (
            <Card key={label}>
              <CardHeader title={label} description={`${xs.length} conversation(s)`} icon={<CalendarClock className={label === 'Overdue' ? 'size-5 text-danger' : 'size-5'} />} />
              <ul className="divide-y divide-line">{xs.map((t) => <Row key={t.id} t={t} />)}</ul>
            </Card>
          ))}
        </div>
      )}
      {done.length > 0 && (
        <Card>
          <CardHeader title="Completed" />
          <ul className="divide-y divide-line">{done.map((t) => <Row key={t.id} t={t} />)}</ul>
        </Card>
      )}
    </>
  )
}
