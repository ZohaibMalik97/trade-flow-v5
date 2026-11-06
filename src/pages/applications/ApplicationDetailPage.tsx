import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  Eye,
  FileSearch,
  FileText,
  GitCompare,
  HelpCircle,
  History,
  Info,
  Lock,
  PlayCircle,
  ShieldCheck,
  Undo2,
  UserRound,
  X,
} from 'lucide-react'
import { assignedTerritoryIds, canViewApplication } from '@/auth/authorize'
import { stageRoleOf, useLookups, useStore, workflowCtx } from '@/app/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Tabs } from '@/components/ui/Tabs'
import { EmptyState, KeyValue, Notice } from '@/components/ui/misc'
import { Checkbox, SelectField, TextareaField } from '@/components/forms/Field'
import { DocumentPreview } from '@/components/data-display/DocumentPreview'
import { useToast } from '@/components/ui/Toast'
import { brands } from '@/data/reference'
import {
  ACTION_LABEL,
  MIN_REASON,
  activeStages,
  availableActions,
  diffContent,
  eligiblePreviousStages,
  isLastStage,
  isStageResponsible,
  stageById,
  type ActionAvailability,
  type ReviewerAction,
} from '@/workflow/engine'
import { SECTION_LABELS } from '@/workflow/onboarding'
import type { ApplicationSection, RegistrationApplication, WorkflowEvent } from '@/types/domain'
import { cn } from '@/utils/cn'
import { date, dateTime, fileSize, hoursBetween, relative } from '@/utils/format'

type Tab = 'details' | 'documents' | 'history' | 'revisions'

export default function ApplicationDetailPage() {
  const { id } = useParams()
  const { state, user, can } = useStore()
  const lookups = useLookups()
  const [tab, setTab] = useState<Tab>('details')
  const [dialog, setDialog] = useState<ReviewerAction | null>(null)
  const [preview, setPreview] = useState<{ name: string; type: string; sizeKb: number } | null>(null)

  const app = state.applications.find((a) => a.id === id)
  const ctx = useMemo(() => workflowCtx(state), [state])
  // Record-level check: a user with the route permission still only sees applications in scope.
  if (!app || !canViewApplication(user, can, app, stageRoleOf(state), assignedTerritoryIds(state, user)))
    return (
      <div className="card">
        <EmptyState icon={<FileSearch className="size-5" />} title="Application not found" description="It does not exist, or it is not assigned to you." action={<ButtonLink to="/app/applications">Back to applications</ButtonLink>} />
      </div>
    )

  const stage = stageById(state.onboardingWorkflow, app.currentStageId)
  const actions = availableActions(ctx, user, can, app)
  const responsible = isStageResponsible(ctx, user, app)
  const internal = can('application.view_internal')
  const assignee = lookups.user(app.assignedToUserId)
  const waited = app.stageEnteredAt ? hoursBetween(app.stageEnteredAt) : 0
  const overdue = stage && ['Submitted', 'Under Review', 'Resubmitted', 'Pending Approval'].includes(app.status) && waited > stage.slaHours

  return (
    <>
      <PageHeader
        title={app.companyName}
        meta={<StatusBadge status={app.status} />}
        description={<>Customer Application <span className="font-mono">{app.ref}</span> · {app.city}, {app.country} · revision {app.revision}</>}
        breadcrumbs={[{ label: 'Customer Onboarding', to: '/app/applications' }, { label: app.ref }]}
      />

      <StageTrack app={app} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          {app.status === 'Returned for Information' && app.returnInfo && (
            <Notice tone="warning" icon={<Undo2 className="size-4" />} title={`${app.returnInfo.type === 'clarification' ? 'Clarification requested' : 'Returned to applicant'} by ${lookups.user(app.returnInfo.byUserId)?.name ?? '—'} · ${relative(app.returnInfo.at)}`}>
              <p className="whitespace-pre-line">{app.returnInfo.instructions}</p>
              {app.returnInfo.editableSections.length > 0 && <p className="mt-1 text-xs">Re-opened: {app.returnInfo.editableSections.map((s) => SECTION_LABELS[s]).join(', ')}</p>}
            </Notice>
          )}
          <Card>
            <div className="px-5 pt-2">
              <Tabs<Tab>
                value={tab}
                onChange={setTab}
                items={[
                  { key: 'details', label: 'Details' },
                  { key: 'documents', label: 'Documents', count: app.documents.filter((d) => !d.supersededAt).length },
                  { key: 'history', label: 'Workflow history', count: app.history.length },
                  { key: 'revisions', label: 'Revisions', count: app.revisions.length },
                ]}
              />
            </div>
            <CardBody>
              {tab === 'details' && <Details app={app} />}
              {tab === 'documents' && <Documents app={app} onPreview={setPreview} />}
              {tab === 'history' && <HistoryList events={app.history} internal={internal} />}
              {tab === 'revisions' && <Revisions app={app} />}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title="Current stage" icon={<UserRound className="size-4" />} />
            <CardBody className="space-y-3 text-[13px]">
              <KeyValue
                cols={1}
                items={[
                  { label: 'Stage', value: stage ? `${stage.name}${stage.kind === 'review' ? ' (review)' : ''}` : app.status === 'Approved' ? 'Completed' : '—' },
                  { label: 'With', value: app.status === 'Returned for Information' ? 'Applicant' : assignee ? `${assignee.name}` : stage ? `${lookups.role(stage.roleId)?.name ?? stage.roleId} queue` : '—' },
                  { label: 'In stage since', value: app.stageEnteredAt ? `${dateTime(app.stageEnteredAt)} (${relative(app.stageEnteredAt)})` : '—' },
                  { label: 'SLA', value: stage ? <span className={cn(overdue && 'font-semibold text-danger-700')}>{stage.slaHours} h{overdue ? ' — overdue' : ''}</span> : '—' },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Actions" icon={<ShieldCheck className="size-4" />} />
            <CardBody className="space-y-2">
              {actions.length === 0 ? (
                <p className="flex items-start gap-2 text-[13px] text-muted">
                  <Lock className="mt-0.5 size-4 shrink-0" />
                  {['Approved', 'Rejected'].includes(app.status)
                    ? `This application is ${app.status.toLowerCase()} — no further workflow actions.`
                    : app.status === 'Returned for Information'
                      ? 'Waiting for the applicant to respond.'
                      : responsible
                        ? 'Your role has no workflow permissions at this stage.'
                        : `Read-only: this stage is assigned to ${assignee?.name ?? 'another user'}. Only the responsible approver can act.`}
                </p>
              ) : (
                actions.map((a) => <ActionButton key={a.action} a={a} onClick={() => setDialog(a.action)} />)
              )}
              {actions.some((a) => !a.allowed) && <p className="pt-1 text-[11px] text-muted">Disabled actions show why when you hover or focus them.</p>}
            </CardBody>
          </Card>

          {can('application.comment') && app.status !== 'Draft' && <InternalComments app={app} />}

          {!internal && (
            <Notice tone="info" icon={<Info className="size-4" />}>Internal reviewer remarks are hidden for your role.</Notice>
          )}
        </aside>
      </div>

      {dialog && <ActionDialog app={app} action={dialog} onClose={() => setDialog(null)} />}
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
    </>
  )
}

const ACTION_ICON: Record<ReviewerAction, typeof Check> = {
  start_review: PlayCircle,
  approve: CheckCircle2,
  reject: X,
  return_to_requester: Undo2,
  request_clarification: HelpCircle,
  return_to_previous: ArrowLeftRight,
}

function ActionButton({ a, onClick }: { a: ActionAvailability; onClick: () => void }) {
  const Icon = ACTION_ICON[a.action]
  const variant = a.tone === 'success' ? 'success' : a.tone === 'danger' ? 'danger' : a.tone === 'primary' ? 'primary' : 'secondary'
  return (
    <div title={a.allowed ? undefined : a.reason}>
      <Button className="w-full justify-start" variant={variant} icon={<Icon className="size-4" />} disabled={!a.allowed} onClick={onClick} aria-describedby={a.allowed ? undefined : `why-${a.action}`}>
        {a.label}
      </Button>
      {!a.allowed && a.reason && <p id={`why-${a.action}`} className="mt-1 text-[11px] text-muted">{a.reason}</p>}
    </div>
  )
}

// ─── Action dialog ─────────────────────────────────────────────────────────

function ActionDialog({ app, action, onClose }: { app: RegistrationApplication; action: ReviewerAction; onClose: () => void }) {
  const { state, applicationAction } = useStore()
  const lookups = useLookups()
  const toast = useToast()
  const ctx = workflowCtx(state)
  const prev = eligiblePreviousStages(ctx, app)
  const [remarks, setRemarks] = useState('')
  const [publicRemarks, setPublicRemarks] = useState('')
  const [sections, setSections] = useState<ApplicationSection[]>([])
  const [target, setTarget] = useState(prev[prev.length - 1]?.stage.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const targetInfo = prev.find((p) => p.stage.id === target)
  const stage = stageById(state.onboardingWorkflow, app.currentStageId)
  const final = isLastStage(state.onboardingWorkflow, app.currentStageId)

  const needsPublic = action === 'reject' || action === 'return_to_requester' || action === 'request_clarification'
  const needsInternal = action === 'return_to_previous'
  const pubLen = publicRemarks.trim().length
  const intLen = remarks.trim().length

  const copy: Record<ReviewerAction, { title: string; description: string; confirm: string; tone: 'primary' | 'success' | 'danger' }> = {
    start_review: { title: `Start ${stage?.name.toLowerCase() ?? 'review'}`, description: 'The application is assigned to you and the applicant sees that review has started.', confirm: 'Start review', tone: 'primary' },
    approve: {
      title: final ? 'Approve registration' : stage?.kind === 'review' ? 'Recommend and forward' : 'Approve this stage',
      description: final ? 'The customer account will be created (mock) and the applicant notified.' : 'The application moves to the next stage and its approver is notified.',
      confirm: final ? 'Approve and activate account' : stage?.kind === 'review' ? 'Forward' : 'Approve',
      tone: 'success',
    },
    reject: { title: 'Reject application', description: 'This is final — the applicant cannot resubmit this application. Use “Return to requester” if corrections could fix the issue.', confirm: 'Reject application', tone: 'danger' },
    return_to_requester: { title: 'Return to requester for correction', description: 'The applicant can edit only the sections you select, then resubmit. Previous values are kept in revision history.', confirm: 'Return to requester', tone: 'primary' },
    request_clarification: { title: 'Request clarification', description: 'Ask the applicant a question. No fields are re-opened; their answer returns to you.', confirm: 'Send request', tone: 'primary' },
    return_to_previous: { title: 'Return to previous approver', description: 'The application goes back to an earlier stage’s queue. Your findings are internal and not shown to the applicant.', confirm: 'Return to approver', tone: 'primary' },
  }
  const c = copy[action]

  const confirm = async () => {
    if (needsPublic && pubLen < MIN_REASON) return setError(`Please enter at least ${MIN_REASON} characters.`)
    if (needsInternal && intLen < MIN_REASON) return setError(`Findings of at least ${MIN_REASON} characters are required.`)
    if (action === 'return_to_requester' && sections.length === 0) return setError('Select at least one section the applicant may edit.')
    const r = await applicationAction(app.id, action, { remarks, publicRemarks, editableSections: sections, targetStageId: target, targetUserId: targetInfo?.userId })
    if (!r.ok) return setError(r.error)
    toast.success(`${ACTION_LABEL[action === 'start_review' ? 'start_review' : action]} — ${app.ref}`, final ? 'Customer account created.' : undefined)
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={c.title}
      description={c.description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant={c.tone} onClick={confirm}>{c.confirm}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-50 px-3 py-2 text-[13px] text-danger-700">
            <AlertTriangle className="mt-px size-4 shrink-0" /> {error}
          </div>
        )}
        {action === 'return_to_previous' && (
          <>
            <SelectField label="Return to stage" required value={target} onChange={(e) => setTarget(e.target.value)} options={prev.map((p) => ({ value: p.stage.id, label: p.stage.name }))} />
            <p className="-mt-2 text-xs text-muted">Recipient: <strong>{lookups.user(targetInfo?.userId)?.name ?? `${lookups.role(targetInfo?.stage.roleId)?.name ?? ''} queue`}</strong> (the approver who last acted at that stage, if still active)</p>
          </>
        )}
        {action === 'return_to_requester' && (
          <fieldset>
            <legend className="label">Sections the applicant may edit <span className="text-danger">*</span></legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(SECTION_LABELS) as ApplicationSection[]).map((s) => (
                <Checkbox key={s} label={SECTION_LABELS[s]} checked={sections.includes(s)} onChange={() => setSections(sections.includes(s) ? sections.filter((x) => x !== s) : [...sections, s])} />
              ))}
            </div>
          </fieldset>
        )}
        {(needsPublic || action === 'approve') && (
          <TextareaField
            label={action === 'reject' ? 'Reason shown to the applicant' : action === 'return_to_requester' ? 'Instructions for the applicant' : action === 'request_clarification' ? 'Question for the applicant' : 'Message to the applicant (optional)'}
            required={needsPublic}
            rows={3}
            value={publicRemarks}
            onChange={(e) => setPublicRemarks(e.target.value)}
            hint={needsPublic ? `${pubLen}/${MIN_REASON} characters minimum · visible on the public tracking page` : 'Visible to the applicant'}
          />
        )}
        <TextareaField
          label={needsInternal ? 'Findings for the approver (internal)' : 'Internal remarks (optional)'}
          required={needsInternal}
          rows={3}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          hint={needsInternal ? `${intLen}/${MIN_REASON} characters minimum · reviewers only` : 'Visible to reviewers only — never shown to the applicant'}
        />
        <p className="flex items-center gap-1.5 text-[11px] text-muted"><History className="size-3.5" /> Recorded with your name and the time in the workflow history. History is never overwritten.</p>
      </div>
    </Dialog>
  )
}

// ─── Panels ────────────────────────────────────────────────────────────────

function StageTrack({ app }: { app: RegistrationApplication }) {
  const { state } = useStore()
  const lookups = useLookups()
  const stages = activeStages(state.onboardingWorkflow)
  const idx = stages.findIndex((s) => s.id === app.currentStageId)
  return (
    <Card>
      <CardBody>
        <ol className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
          {stages.map((s, i) => {
            const lastApproval = [...app.history].reverse().find((e) => e.action === 'approve' && e.fromStageId === s.id)
            const done = app.status === 'Approved' || (idx > i && !!lastApproval)
            const current = i === idx && !['Approved'].includes(app.status)
            const blocked = current && (app.status === 'Returned for Information' || app.status === 'Rejected')
            return (
              <li key={s.id} className={cn('rounded-lg border px-3 py-2.5', current ? (blocked ? 'border-warning/50 bg-warning-50/40' : 'border-primary/40 bg-primary-50/40') : done ? 'border-teal-200 bg-success-50/40' : 'border-line')}>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {done ? <Check className="size-3.5 text-success" /> : <span className="tabular">{i + 1}</span>} {s.kind}
                </p>
                <p className="mt-0.5 text-[13px] font-semibold">{s.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {done && lastApproval ? `${lookups.user(lastApproval.actorId)?.name ?? '—'} · ${date(lastApproval.at)}` : current ? (app.status === 'Returned for Information' ? 'With applicant' : app.status === 'Rejected' ? 'Rejected here' : lookups.user(app.assignedToUserId)?.name ?? `${lookups.role(s.roleId)?.name} queue`) : lookups.role(s.roleId)?.name}
                </p>
              </li>
            )
          })}
        </ol>
      </CardBody>
    </Card>
  )
}

function Details({ app }: { app: RegistrationApplication }) {
  const lookups = useLookups()
  return (
    <div className="space-y-4">
      <KeyValue
        cols={3}
        items={[
          { label: 'Trading name', value: app.companyName },
          { label: 'Legal name', value: app.legalName },
          { label: 'Business type', value: app.businessType },
          { label: 'CR number', value: <span className="font-mono">{app.crNumber}</span> },
          { label: 'Tax / VAT', value: <span className="font-mono">{app.taxNumber}</span> },
          { label: 'Annual volume', value: app.annualVolumeBand },
          { label: 'Territory', value: lookups.territory(app.territoryId)?.name ?? '—' },
          { label: 'Website', value: app.website ?? '—' },
          { label: 'Applicant account', value: lookups.user(app.applicantUserId)?.email ?? '—' },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-line p-4 text-[13px]">
          <p className="label">Primary contact</p>
          <p className="font-medium">{app.contact.name}</p>
          <p className="text-muted">{app.contact.role}</p>
          <p className="mt-1">{app.contact.email} · {app.contact.phone}</p>
        </div>
        <div className="rounded-lg border border-line p-4 text-[13px]">
          <p className="label">Requested brands</p>
          <div className="flex flex-wrap gap-1.5">{app.requestedBrandIds.map((b) => <Badge key={b}>{brands.find((x) => x.id === b)?.name ?? b}</Badge>)}</div>
        </div>
        <div className="rounded-lg border border-line p-4 text-[13px]">
          <p className="label">Billing address</p>
          <p>{app.billingAddress.line1}, {app.billingAddress.city} {app.billingAddress.postalCode ?? ''}, {app.billingAddress.country}</p>
        </div>
        <div className="rounded-lg border border-line p-4 text-[13px]">
          <p className="label">Delivery address</p>
          <p>{app.deliveryAddress.line1}, {app.deliveryAddress.city}, {app.deliveryAddress.country}</p>
        </div>
      </div>
    </div>
  )
}

function Documents({ app, onPreview }: { app: RegistrationApplication; onPreview: (d: { name: string; type: string; sizeKb: number }) => void }) {
  const current = app.documents.filter((d) => !d.supersededAt)
  const old = app.documents.filter((d) => d.supersededAt)
  const row = (d: RegistrationApplication['documents'][number]) => (
    <li key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-[13px]">
      <FileText className="size-4 text-primary" />
      <span className={cn('min-w-0 flex-1 truncate', d.supersededAt ? 'text-muted line-through' : 'font-medium')}>{d.name}</span>
      <span className="text-xs text-muted">{d.type} · {fileSize(d.sizeKb)} · rev. {d.revision}{d.supersededAt ? ` → replaced in rev. ${d.supersededInRevision}` : ''}</span>
      <Button size="sm" variant="ghost" icon={<Eye className="size-3.5" />} onClick={() => onPreview(d)}>Preview</Button>
    </li>
  )
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line rounded-lg border border-line">{current.length ? current.map(row) : <li className="px-3 py-3 text-[13px] text-muted">No current documents.</li>}</ul>
      {old.length > 0 && (
        <div>
          <p className="label">Superseded (kept for audit)</p>
          <ul className="divide-y divide-line rounded-lg border border-line bg-canvas/60">{old.map(row)}</ul>
        </div>
      )}
      <p className="text-[11px] text-muted">Prototype: file contents are not stored — previews are placeholders. Production requires secure object storage with access control and malware scanning.</p>
    </div>
  )
}

function InternalComments({ app }: { app: RegistrationApplication }) {
  const { commentOnApplication } = useStore()
  const lookups = useLookups()
  const toast = useToast()
  const [text, setText] = useState('')
  const [error, setError] = useState<string>()
  const comments = app.history.filter((e) => e.action === 'comment').reverse()
  return (
    <Card>
      <CardHeader title="Internal comments" description="Reviewers only — never shown to the applicant" />
      <CardBody className="space-y-3">
        <TextareaField aria-label="Internal comment" rows={2} placeholder="Record a finding or note…" value={text} error={error} onChange={(e) => { setText(e.target.value); setError(undefined) }} />
        <Button
          size="sm"
          variant="secondary"
          disabled={!text.trim()}
          onClick={async () => {
            const r = await commentOnApplication(app.id, text)
            if (!r.ok) return setError(r.error)
            setText('')
            toast.success('Comment saved', 'Internal — not visible to the applicant')
          }}
        >
          Add comment
        </Button>
        {comments.length > 0 && (
          <ul className="space-y-2 border-t border-line pt-3">
            {comments.map((c) => (
              <li key={c.id} className="text-[13px]">
                <p className="whitespace-pre-line">{c.remarks}</p>
                <p className="text-[11px] text-muted">{lookups.user(c.actorId)?.name ?? '—'} · {dateTime(c.at)}</p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

export function HistoryList({ events, internal }: { events: WorkflowEvent[]; internal: boolean }) {
  const { state } = useStore()
  const lookups = useLookups()
  const stageName = (id?: string) => stageById(state.onboardingWorkflow, id)?.name
  const rows = [...events].filter((e) => internal || e.visibility === 'public').reverse()
  return (
    <ol className="relative space-y-4" aria-label="Workflow history (newest first)">
      {rows.map((e, i) => (
        <li key={e.id} className="relative flex gap-3">
          {i < rows.length - 1 && <span className="absolute left-3.5 top-8 -bottom-4 w-px bg-line" aria-hidden />}
          <span className={cn('relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-surface', e.action === 'reject' ? 'bg-danger-50 text-danger-700' : e.action === 'approve' || e.action === 'account_created' ? 'bg-success-50 text-success-700' : e.action.startsWith('return') || e.action === 'request_clarification' ? 'bg-warning-50 text-warning-700' : 'bg-slate-100 text-slate-600')}>
            {e.action === 'reject' ? <X className="size-3.5" /> : e.action === 'approve' ? <Check className="size-3.5" /> : e.action.startsWith('return') ? <Undo2 className="size-3.5" /> : <History className="size-3.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px]">
              <span className="font-semibold">{e.actorId === 'system' ? 'System' : lookups.user(e.actorId)?.name ?? e.actorId}</span> · {ACTION_LABEL[e.action]}
              {e.action === 'assign' && e.toStageId && <> to <strong>{stageName(e.toStageId)}</strong>{e.toUserId && <> — {lookups.user(e.toUserId)?.name}</>}</>}
              {e.action === 'return_to_previous' && <> → <strong>{stageName(e.toStageId)}</strong> ({lookups.user(e.toUserId)?.name ?? 'queue'})</>}
              {e.action === 'approve' && e.fromStageId && <> at <strong>{stageName(e.fromStageId)}</strong></>}
              {e.visibility === 'internal' && <Badge tone="dark" className="ml-2">Internal</Badge>}
            </p>
            <p className="text-xs text-muted">{dateTime(e.at)} · {e.fromStatus && e.fromStatus !== e.toStatus ? `${e.fromStatus} → ` : ''}{e.toStatus} · rev. {e.revision}</p>
            {e.publicRemarks && <p className="mt-1.5 rounded-lg border border-line bg-canvas px-3 py-2 text-[13px]"><span className="mr-1 text-[11px] font-semibold uppercase text-muted">To applicant:</span>{e.publicRemarks}</p>}
            {internal && e.remarks && <p className="mt-1.5 rounded-lg border border-dashed border-line-strong bg-surface px-3 py-2 text-[13px]"><span className="mr-1 text-[11px] font-semibold uppercase text-muted">Internal:</span>{e.remarks}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

function Revisions({ app }: { app: RegistrationApplication }) {
  if (app.revisions.length === 0) return <p className="text-[13px] text-muted">No submitted revisions yet.</p>
  return (
    <ol className="space-y-4">
      {[...app.revisions].reverse().map((r, i, arr) => {
        const prevRev = arr[i + 1]
        const changes = prevRev ? diffContent(prevRev.content, r.content) : []
        return (
          <li key={r.revision} className="rounded-lg border border-line">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <p className="text-[13px] font-semibold">Revision {r.revision}</p>
              <p className="text-xs text-muted">Submitted {dateTime(r.submittedAt)}</p>
            </div>
            <div className="px-4 py-3 text-[13px]">
              {!prevRev ? (
                <p className="text-muted">Original submission.</p>
              ) : changes.length === 0 ? (
                <p className="text-muted">No field changes (documents only).</p>
              ) : (
                <table className="w-full text-left">
                  <caption className="sr-only">Changes from revision {prevRev.revision}</caption>
                  <thead className="text-[11px] uppercase text-muted"><tr><th className="py-1 pr-3 font-medium">Field</th><th className="py-1 pr-3 font-medium">Before</th><th className="py-1 font-medium">After</th></tr></thead>
                  <tbody>
                    {changes.map((c) => (
                      <tr key={c.field} className="border-t border-line align-top">
                        <td className="py-1.5 pr-3 font-medium"><GitCompare className="mr-1 inline size-3.5 text-muted" />{c.field}</td>
                        <td className="py-1.5 pr-3 text-danger-700 line-through decoration-danger/40">{c.before || '—'}</td>
                        <td className="py-1.5 text-success-700">{c.after || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
