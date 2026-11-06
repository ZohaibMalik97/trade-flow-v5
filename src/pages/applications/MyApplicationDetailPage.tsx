import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BadgeCheck, Copy, FileText, Link2, PencilLine, RefreshCw, Send } from 'lucide-react'
import { useStore } from '@/app/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { PublicStatusCard } from '@/components/applications/PublicStatusCard'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { EmptyState, KeyValue } from '@/components/ui/misc'
import { TextareaField } from '@/components/forms/Field'
import { useToast } from '@/components/ui/Toast'
import { applicantCanEdit } from '@/workflow/engine'
import { toPublicView } from '@/workflow/publicView'
import { brands } from '@/data/reference'
import { date, fileSize } from '@/utils/format'
import { absoluteAppUrl } from '@/utils/url'

/** Applicant's own application: applicant-safe status + own submitted content. */
export default function MyApplicationDetailPage() {
  const { id } = useParams()
  const { state, user, can, submitOwnApplication, resubmitOwnApplication, renewTrackingLink } = useStore()
  const toast = useToast()
  const app = state.applications.find((a) => a.id === id && a.applicantUserId === user.id)
  const view = useMemo(() => (app ? toPublicView(state.onboardingWorkflow, app) : null), [app, state.onboardingWorkflow])
  const [answer, setAnswer] = useState('')
  const [answerError, setAnswerError] = useState<string>()
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  // The server stores only a hash of the tracking token, so a copyable link exists only right after (re)generation.
  const [freshLink, setFreshLink] = useState<string | null>(null)

  if (!app || !view)
    return (
      <div className="card">
        <EmptyState icon={<BadgeCheck className="size-5" />} title="Application not found" description="It may have been removed, or it belongs to another account." action={<ButtonLink to="/app/my-applications">Back to my applications</ButtonLink>} />
      </div>
    )

  const editable = applicantCanEdit(app, user, can)
  const clarification = app.status === 'Returned for Information' && app.returnInfo?.type === 'clarification'
  const link = freshLink ? (freshLink.startsWith('/') ? absoluteAppUrl(freshLink) : freshLink) : null
  const expired = !freshLink && new Date(app.trackingTokenExpiresAt).getTime() < Date.now()

  return (
    <>
      <PageHeader
        title={app.companyName || 'Customer application'}
        meta={<StatusBadge status={app.status} />}
        description={<>Reference <span className="font-mono">{app.ref}</span></>}
        breadcrumbs={[{ label: 'My Applications', to: '/app/my-applications' }, { label: app.ref }]}
        actions={
          <>
            {editable && app.status === 'Draft' && <ButtonLink to={`/app/my-applications/${app.id}/edit`} variant="secondary" icon={<PencilLine className="size-4" />}>Continue editing</ButtonLink>}
            {editable && app.status === 'Draft' && <Button icon={<Send className="size-4" />} onClick={() => setConfirmSubmit(true)}>Submit</Button>}
            {editable && app.status === 'Returned for Information' && <ButtonLink to={`/app/my-applications/${app.id}/edit`} icon={<PencilLine className="size-4" />}>Correct and resubmit</ButtonLink>}
          </>
        }
      />

      <PublicStatusCard
        view={view}
        footer={
          <>
            {clarification && can('application.resubmit') && (
              <Card>
                <CardHeader title="Answer the clarification" description="Your answer goes back to the reviewer who asked." />
                <CardBody className="space-y-3">
                  <TextareaField label="Your answer" required rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} error={answerError} />
                  <Button
                    icon={<Send className="size-4" />}
                    onClick={async () => {
                      const r = await resubmitOwnApplication(app.id, answer)
                      if (!r.ok) return setAnswerError(r.error)
                      setAnswer('')
                      setAnswerError(undefined)
                      toast.success('Clarification sent', 'Your application is back with the reviewer.')
                    }}
                  >
                    Send answer
                  </Button>
                </CardBody>
              </Card>
            )}
            {app.status !== 'Draft' && (
              <Card>
                <CardHeader title="Secure tracking link" description="Share only with colleagues who should see the status." icon={<Link2 className="size-4" />} />
                <CardBody className="space-y-3 text-[13px]">
                  <p className="text-muted">{expired ? 'Your link has expired.' : `Valid until ${date(app.trackingTokenExpiresAt)}.`}{!link && !expired && ' The link was emailed to your contact address; for security it cannot be shown again — regenerate it to copy a new one.'}</p>
                  <div className="flex flex-wrap gap-2">
                    {link && (
                      <Button size="sm" variant="secondary" icon={<Copy className="size-3.5" />} onClick={() => { navigator.clipboard?.writeText(link).catch(() => undefined); toast.info('Tracking link copied') }}>
                        Copy link
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<RefreshCw className="size-3.5" />}
                      onClick={async () => {
                        const r = await renewTrackingLink(app.id)
                        if (!r.ok) return toast.error('Could not create a link', r.error)
                        setFreshLink(r.link)
                        toast.success('New tracking link created', 'Copy it now — the previous link no longer works.')
                      }}
                    >
                      {expired ? 'Create new link' : 'Revoke & regenerate'}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            )}
          </>
        }
      />

      <Card className="mt-5">
        <CardHeader title="What you submitted" description={`Revision ${app.revision}${app.revisions.length > 1 ? ` · ${app.revisions.length} submitted versions kept` : ''}`} icon={<FileText className="size-4" />} />
        <CardBody className="space-y-5">
          <KeyValue
            cols={3}
            items={[
              { label: 'Legal name', value: app.legalName || '—' },
              { label: 'CR number', value: app.crNumber || '—' },
              { label: 'Tax number', value: app.taxNumber || '—' },
              { label: 'Location', value: app.city ? `${app.city}, ${app.country}` : '—' },
              { label: 'Primary contact', value: app.contact.name ? `${app.contact.name} · ${app.contact.email}` : '—' },
              { label: 'Requested brands', value: app.requestedBrandIds.map((b) => brands.find((x) => x.id === b)?.name).join(', ') || '—' },
            ]}
          />
          <div>
            <p className="label">Documents</p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {app.documents.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">No documents uploaded.</li>}
              {app.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
                  <FileText className="size-4 text-primary" />
                  <span className={d.supersededAt ? 'text-muted line-through' : 'font-medium'}>{d.name}</span>
                  <span className="text-xs text-muted">{d.type} · {fileSize(d.sizeKb)} · rev. {d.revision}</span>
                  {d.supersededAt && <span className="text-xs text-muted">(replaced in revision {d.supersededInRevision})</span>}
                </li>
              ))}
            </ul>
          </div>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={async () => {
          const r = await submitOwnApplication(app.id)
          setConfirmSubmit(false)
          if (!r.ok) toast.error('Cannot submit yet', r.error)
          else toast.success('Application submitted', `${app.ref} is queued for initial review.`)
        }}
        title="Submit your customer application?"
        description="After submission you can no longer edit it unless a reviewer returns it to you."
        confirmLabel="Submit"
      />
    </>
  )
}
