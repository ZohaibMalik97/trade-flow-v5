import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, AlertTriangle, Lock } from 'lucide-react'
import { useStore } from '@/app/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState, Notice } from '@/components/ui/misc'
import { ButtonLink } from '@/components/ui/Button'
import { TextareaField } from '@/components/forms/Field'
import { useToast } from '@/components/ui/Toast'
import { CustomerApplicationForm, type ApplicationFormOutput } from '@/components/applications/CustomerApplicationForm'
import { applicantCanEdit, contentOf } from '@/workflow/engine'
import { SECTION_LABELS } from '@/workflow/onboarding'

/** Applicant edits a draft, or corrects the sections a reviewer re-opened, then (re)submits. */
export default function EditApplicationPage() {
  const { id } = useParams()
  const { state, user, can, saveOwnApplication, submitOwnApplication, resubmitOwnApplication } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const app = state.applications.find((a) => a.id === id && a.applicantUserId === user.id)
  // Freeze initial values for the lifetime of the form.
  const [initial] = useState(() => (app ? contentOf(app) : undefined))

  if (!app || !initial)
    return <div className="card"><EmptyState icon={<AlertCircle className="size-5" />} title="Application not found" action={<ButtonLink to="/app/my-applications">Back to my applications</ButtonLink>} /></div>

  if (!applicantCanEdit(app, user, can))
    return (
      <div className="card">
        <EmptyState
          icon={<Lock className="size-5" />}
          title="This application cannot be edited now"
          description={app.status === 'Returned for Information' ? 'The reviewer asked a question — answer it from the application page.' : `It is ${app.status.toLowerCase()} and with the review team. You will be notified if anything is needed.`}
          action={<ButtonLink to={`/app/my-applications/${app.id}`}>View application</ButtonLink>}
        />
      </div>
    )

  const correction = app.status === 'Returned for Information'
  const save = (o: ApplicationFormOutput) => saveOwnApplication(app.id, { content: o.content, addDocuments: o.addDocuments, supersedeDocumentIds: o.supersedeDocumentIds })

  return (
    <>
      <PageHeader
        title={correction ? `Correct ${app.ref}` : `Complete ${app.ref}`}
        description={correction ? 'Only the sections the reviewer re-opened can be changed. Your previous version is kept in the history.' : 'Your draft is private until you submit it.'}
        breadcrumbs={[{ label: 'My Applications', to: '/app/my-applications' }, { label: app.ref, to: `/app/my-applications/${app.id}` }, { label: correction ? 'Correct' : 'Edit' }]}
      />
      {correction && app.returnInfo && (
        <Notice tone="warning" className="mb-4" icon={<AlertTriangle className="size-4" />} title="Reviewer’s instructions">
          <p className="whitespace-pre-line">{app.returnInfo.instructions}</p>
          <p className="mt-2 text-xs">Open for correction: <strong>{app.returnInfo.editableSections.map((s) => SECTION_LABELS[s]).join(', ')}</strong></p>
        </Notice>
      )}
      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-50 px-3 py-2.5 text-[13px] text-danger-700">
          <AlertCircle className="mt-px size-4 shrink-0" /> {error}
        </div>
      )}
      <CustomerApplicationForm
        mode={correction ? 'correction' : 'draft'}
        initial={initial}
        existingDocuments={app.documents}
        editableSections={correction ? app.returnInfo?.editableSections : undefined}
        submitLabel={correction ? 'Resubmit application' : 'Submit application'}
        reviewExtra={correction ? <TextareaField label="Message to the reviewer (optional)" rows={3} value={note} onChange={(e) => setNote(e.target.value)} hint="Shown to the reviewer and on your own timeline." /> : undefined}
        onSaveDraft={async (o) => {
          const r = await save(o)
          if (!r.ok) return setError(r.error)
          setError(null)
          toast.success(correction ? 'Changes saved' : 'Draft saved', 'Not yet sent to the reviewer.')
        }}
        onSubmit={async (o) => {
          const saved = await save(o)
          if (!saved.ok) return setError(saved.error)
          const r = correction ? await resubmitOwnApplication(app.id, note) : await submitOwnApplication(app.id)
          if (!r.ok) return setError(r.error)
          toast.success(correction ? 'Application resubmitted' : 'Application submitted', app.ref)
          navigate(`/app/my-applications/${app.id}`)
        }}
      />
    </>
  )
}
