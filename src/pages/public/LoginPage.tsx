import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowRight, Eye, EyeOff, FlaskConical, KeyRound, Lock, Mail, Search } from 'lucide-react'
import { canFor, useStore } from '@/app/store'
import { Logo } from '@/components/layout/Logo'
import { Avatar } from '@/components/ui/misc'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/forms/Field'
import { useToast } from '@/components/ui/Toast'
import { BRAND } from '@/config/brand'
import { DEMO_ACCOUNTS } from '@/data/reference'
import { landingPathFor } from '@/config/navigation'

/** Only allow redirects inside the signed-in app (prevents open redirects). */
const safeNext = (next: string | null) => (next && next.startsWith('/app') && !next.startsWith('//') ? next : null)

export default function LoginPage() {
  const store = useStore()
  const { state, login, isAuthenticated, can } = store
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (isAuthenticated && !busy) return <Navigate to={next ?? landingPathFor(can)} replace />

  const submit = async (e?: FormEvent, override?: { email: string; password: string }) => {
    e?.preventDefault()
    const em = (override?.email ?? email).trim()
    const pw = override?.password ?? password
    const errs: typeof errors = {}
    if (!em) errs.email = 'Enter your email address.'
    else if (!/^\S+@\S+\.\S+$/.test(em)) errs.email = 'Enter a valid email address.'
    if (!pw) errs.password = 'Enter your password.'
    setErrors(errs)
    setFormError(null)
    if (Object.keys(errs).length) return
    setBusy(true)
    const r = await login(em, pw)
    if (!r.ok) {
      setBusy(false)
      setFormError(r.error)
      setPassword('')
      return
    }
    toast.success(`Welcome, ${r.user.name.split(' ')[0]}`, r.mustChangePassword ? 'Please change your temporary password (user menu › Change password).' : undefined)
    navigate(next ?? landingPathFor(canFor(store.state, r.user)), { replace: true })
    setBusy(false)
  }

  // Demo accounts are listed only when the server runs in demo mode (never in production). The password is not shipped.
  const accounts = DEMO_ACCOUNTS
  const signInAs = (em: string) => {
    setEmail(em)
    setPassword('')
    setFormError(null)
    document.getElementById('login-password')?.focus()
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[420px_1fr]">
      <aside className="hidden flex-col justify-between bg-midnight p-10 text-white lg:flex">
        <Link to="/"><Logo dark /></Link>
        <div>
          <p className="text-2xl font-semibold leading-snug tracking-tight">{BRAND.tagline}</p>
          <p className="mt-3 text-sm text-slate-400">Sign in to see the modules and records your role permits. Prospective customers can track an application without signing in.</p>
          <Link to="/track" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-indigo-200 hover:text-white">
            <Search className="size-4" /> Track an application
          </Link>
        </div>
        <p className="text-xs text-slate-500">{BRAND.demoNotice}</p>
      </aside>

      <main className="flex items-start justify-center bg-canvas px-5 py-12 lg:items-center">
        <div className="grid w-full max-w-5xl gap-8 xl:grid-cols-[minmax(0,400px)_1fr]">
          <div>
            <div className="mb-8 lg:hidden"><Link to="/"><Logo /></Link></div>
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1 text-[13px] text-muted">Use the email address registered for your account.</p>

            <div className="mt-4 flex items-start gap-2 rounded-lg border border-dashed border-primary/40 bg-primary-50/70 px-3 py-2 text-xs text-primary-700">
              <FlaskConical className="mt-px size-4 shrink-0" />
              <span>Your session is protected by short-lived tokens; repeated failed sign-ins lock the account for a few minutes.</span>
            </div>

            <form onSubmit={submit} noValidate className="mt-4 space-y-4" aria-describedby={formError ? 'login-error' : undefined}>
              {formError && (
                <div id="login-error" role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-50 px-3 py-2.5 text-[13px] text-danger-700">
                  <AlertCircle className="mt-px size-4 shrink-0" /> {formError}
                </div>
              )}
              <TextField
                label="Email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
                leading={<Mail className="size-4" />}
                placeholder="name@company.com"
              />
              <TextField
                label="Password"
                id="login-password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                leading={<Lock className="size-4" />}
                trailing={
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink">
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                }
              />
              <Button type="submit" className="w-full" loading={busy} iconRight={<ArrowRight className="size-4" />}>
                Sign in
              </Button>
              <p className="text-xs text-muted"><Link to="/forgot-password" className="font-medium text-primary hover:underline">Forgot your password?</Link></p>
            </form>

            <div className="mt-8 space-y-2 text-[13px] text-muted">
              <p>New customer? <Link to="/register" className="font-medium text-primary hover:underline">Register your company</Link></p>
              <p>Already applied? <Link to="/track" className="font-medium text-primary hover:underline">Track your application</Link></p>
            </div>
          </div>

          {state.system?.demoEnabled && accounts.length > 0 && <section aria-labelledby="demo-accounts" className="card self-start p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="demo-accounts" className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-primary" /> Demo accounts</h2>
                <p className="mt-1 text-xs text-muted">
                  This environment runs with demo data. Choosing an account fills in the email — enter the demo password your administrator configured (Demo:Password).
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {accounts.map(({ userId, label, description, email: accountEmail }) => (
                <li key={userId}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => signInAs(accountEmail)}
                    className="group flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-primary-50/30 disabled:opacity-60"
                  >
                    <Avatar name={label} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold">{label} <span className="font-normal text-muted">· {accountEmail}</span></span>
                      <span className="block truncate text-[11px] text-muted">{description}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted group-hover:text-primary" />
                  </button>
                </li>
              ))}
            </ul>
          </section>}
        </div>
      </main>

    </div>
  )
}
