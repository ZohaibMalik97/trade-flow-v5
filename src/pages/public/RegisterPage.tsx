import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Check, Copy, FlaskConical, LogIn, Save, Search } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'
import { ButtonLink, Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/misc'
import { useStore } from '@/app/store'
import { useToast } from '@/components/ui/Toast'
import { absoluteAppUrl } from '@/utils/url'
import { CustomerApplicationForm, type ApplicationFormOutput } from '@/components/applications/CustomerApplicationForm'

/** Public customer registration: creates the applicant account and the Customer Application. */
export default function RegisterPage() {
  const { registerApplicant, isAuthenticated, user } = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ ref: string; appId: string; trackingLink: string; submitted: boolean; email: string }>()

  const run = (out: ApplicationFormOutput, submit: boolean) => {
    if (!out.account) return
    setBusy(true)
    setError(null)
    setTimeout(async () => {
      const r = await registerApplicant({ account: out.account!, content: out.content, documents: out.addDocuments, submit })
      setBusy(false)
      if (!r.ok) {
        setError(r.error)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      setDone({ ...r, submitted: submit, email: out.account!.email })
      toast.success(submit ? 'Customer application submitted' : 'Draft saved', `Reference ${r.ref}`)
    }, 600)
  }

  if (done) {
    const url = absoluteAppUrl(done.trackingLink)
    return (
      <Shell>
        <div className="card mx-auto max-w-xl p-8 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-50 text-success-700 ring-8 ring-success-50/50">
            {done.submitted ? <Check className="size-7" /> : <Save className="size-7" />}
          </span>
          <h1 className="mt-5 text-xl font-semibold">{done.submitted ? 'Customer application received' : 'Draft saved'}</h1>
          <p className="mt-2 text-[13px] text-muted">
            Your reference is <span className="font-mono font-medium text-ink">{done.ref}</span>.{' '}
            {done.submitted
              ? 'An initial reviewer checks your information and documents first; commercial and final approval follow. You will be notified at each step.'
              : 'Your account has been created. Sign in at any time to complete and submit the application.'}
          </p>
          {done.submitted && (
            <div className="mt-5 rounded-lg border border-line bg-canvas p-4 text-left">
              <p className="text-[13px] font-semibold">Track without signing in</p>
              <p className="mt-1 text-xs text-muted">Use your reference with <strong>{done.email}</strong>, or this secure link (valid for 30 days, keep it private):</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1.5 font-mono text-[11px] ring-1 ring-line">{url}</code>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Copy className="size-3.5" />}
                  onClick={() => {
                    navigator.clipboard?.writeText(url).catch(() => undefined)
                    toast.info('Tracking link copied')
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          )}
          <Notice tone="demo" className="mt-5 text-left" icon={<FlaskConical className="size-4" />}>
            Your account and application are saved. We email you a secure tracking link; a customer account is created only after approval.
          </Notice>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <ButtonLink to={done.submitted ? `/app/my-applications/${done.appId}` : `/app/my-applications/${done.appId}/edit`} icon={<LogIn className="size-4" />}>
              {done.submitted ? 'Open my application' : 'Continue my application'}
            </ButtonLink>
            {done.submitted && <ButtonLink to={done.trackingLink} variant="secondary" icon={<Search className="size-4" />}>Public tracking page</ButtonLink>}
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="mx-auto mb-4 max-w-5xl">
        <h1 className="text-xl font-semibold tracking-tight">Customer registration</h1>
        <p className="mt-1 text-[13px] text-muted">About 5 minutes. Fields marked * are required. You can save a draft and finish later.</p>
        {isAuthenticated && (
          <Notice tone="warning" className="mt-4" icon={<AlertCircle className="size-4" />}>
            You are signed in as {user.name}. Registering creates a separate applicant account. <Link to="/app" className="font-medium underline">Return to the portal</Link>
          </Notice>
        )}
        {error && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-50 px-3 py-2.5 text-[13px] text-danger-700">
            <AlertCircle className="mt-px size-4 shrink-0" /> {error}
          </div>
        )}
      </div>
      <CustomerApplicationForm mode="register" submitLabel="Submit application" busy={busy} onSaveDraft={(o) => run(o, false)} onSubmit={(o) => run(o, true)} />
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/"><Logo /></Link>
          <div className="flex items-center gap-2 text-[13px]">
            <ButtonLink to="/track" variant="ghost" size="sm" icon={<Search className="size-4" />}>Track application</ButtonLink>
            <ButtonLink to="/login" variant="secondary" size="sm">Sign in</ButtonLink>
          </div>
        </div>
      </header>
      <main className="px-5 py-10">{children}</main>
    </div>
  )
}
