import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CheckCircle2, Lock, Mail } from 'lucide-react'
import { useStore } from '@/app/store'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/forms/Field'
import { useToast } from '@/components/ui/Toast'

function Frame({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-start justify-center bg-canvas px-5 py-16">
      <div className="w-full max-w-md">
        <Link to="/"><Logo /></Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-[13px] text-muted">{intro}</p>
        <div className="mt-6">{children}</div>
        <p className="mt-8 text-[13px]"><Link to="/login" className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><ArrowLeft className="size-3.5" /> Back to sign in</Link></p>
      </div>
    </div>
  )
}

const ErrorBox = ({ text }: { text: string }) => (
  <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-50 px-3 py-2.5 text-[13px] text-danger-700"><AlertCircle className="mt-px size-4 shrink-0" /> {text}</div>
)

/** Request a reset link. The answer is the same whether or not the account exists. */
export function ForgotPasswordPage() {
  const { requestPasswordReset } = useStore()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.')
    setBusy(true)
    const r = await requestPasswordReset(email)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setSent(true)
  }
  return (
    <Frame title="Reset your password" intro="Enter the email address of your account. If it exists, we send a link to choose a new password.">
      {sent ? (
        <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success-50 px-3 py-3 text-[13px] text-success-700"><CheckCircle2 className="mt-px size-4 shrink-0" /> If an account exists for {email.trim()}, a reset link is on its way. The link expires after a short time.</div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          {error && <ErrorBox text={error} />}
          <TextField label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} leading={<Mail className="size-4" />} />
          <Button type="submit" className="w-full" loading={busy}>Send reset link</Button>
        </form>
      )}
    </Frame>
  )
}

/** Choose a new password with the token from the e-mail. */
export function ResetPasswordPage() {
  const { resetPassword } = useStore()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const token = params.get('token') ?? ''
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(token ? null : 'This reset link is incomplete. Request a new one.')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pw.length < 8) return setError('Use at least 8 characters, with letters and numbers.')
    if (pw !== pw2) return setError('The passwords do not match.')
    setBusy(true)
    const r = await resetPassword(token, pw)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    toast.success('Password changed', 'Sign in with your new password.')
    navigate('/login', { replace: true })
  }
  return (
    <Frame title="Choose a new password" intro="All your other sessions are signed out when the password changes.">
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <ErrorBox text={error} />}
        <TextField label="New password" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} leading={<Lock className="size-4" />} />
        <TextField label="Repeat new password" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} leading={<Lock className="size-4" />} />
        <Button type="submit" className="w-full" loading={busy} disabled={!token}>Change password</Button>
      </form>
    </Frame>
  )
}

/** Signed-in password change (also used after an administrator issued a temporary password). */
export function ChangePasswordPage() {
  const { changePassword } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!cur) return setError('Enter your current password.')
    if (pw.length < 8) return setError('Use at least 8 characters, with letters and numbers.')
    if (pw !== pw2) return setError('The new passwords do not match.')
    setBusy(true)
    const r = await changePassword(cur, pw)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    toast.success('Password changed', 'Your other sessions were signed out.')
    navigate('/app')
  }
  return (
    <div className="card mx-auto mt-6 max-w-md p-6">
      <h1 className="text-lg font-semibold">Change password</h1>
      <p className="mt-1 text-[13px] text-muted">Other devices are signed out; this session stays active.</p>
      <form onSubmit={submit} noValidate className="mt-5 space-y-4">
        {error && <ErrorBox text={error} />}
        <TextField label="Current password" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} />
        <TextField label="New password" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
        <TextField label="Repeat new password" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
        <Button type="submit" loading={busy}>Change password</Button>
      </form>
    </div>
  )
}

export default ForgotPasswordPage
