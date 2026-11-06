import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FlaskConical,
  GitBranch,
  Globe2,
  Mail,
  PackageCheck,
  Receipt,
  Search,
  ShieldCheck,
  Truck,
  Wallet,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { BRAND } from '@/config/brand'
import { Logo } from '@/components/layout/Logo'
import { ButtonLink } from '@/components/ui/Button'

const FEATURES = [
  { icon: BadgeCheck, title: 'Customer onboarding', text: 'Guided customer registration, configurable review and approval stages, and secure public application tracking.' },
  { icon: ClipboardList, title: 'Sales order requests', text: 'Catalogue-driven ordering with configurable tester and sample allocations calculated as you build the order.' },
  { icon: GitBranch, title: 'Territory-based approvals', text: 'Value-banded approval chains across territory, regional and general management — with SLA tracking.' },
  { icon: Receipt, title: 'Proforma & payments', text: 'Proforma invoices, receipt upload and finance verification, clearly separated at every step.' },
  { icon: Truck, title: 'Fulfilment visibility', text: 'From warehouse preparation to collection reference — packing lists and shipping documents in one place.' },
  { icon: Mail, title: 'Linked correspondence', text: 'Email threads tied to customers and orders, with follow-ups that never fall through the cracks.' },
]

const FLOW = [
  { icon: BadgeCheck, label: 'Register' },
  { icon: ClipboardList, label: 'Request' },
  { icon: GitBranch, label: 'Approve' },
  { icon: Receipt, label: 'Proforma' },
  { icon: Wallet, label: 'Pay' },
  { icon: PackageCheck, label: 'Collect' },
]

function HeroPreview() {
  const bars = [42, 58, 51, 66, 72, 64, 81, 77, 88, 84, 93, 98]
  return (
    <div className="relative mx-auto w-full max-w-xl" aria-hidden>
      <div className="absolute -inset-6 rounded-[28px] bg-primary/25 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#161e2e] shadow-2xl">
        <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="ml-3 h-5 flex-1 rounded-md bg-white/5" />
        </div>
        <div className="grid grid-cols-3 gap-3 p-4">
          {[
            ['Open requests', '24', 'text-amber-300'],
            ['Awaiting payment', '6', 'text-sky-300'],
            ['Ready to collect', '3', 'text-teal-300'],
          ].map(([l, v, c]) => (
            <div key={l} className="rounded-lg bg-white/[0.04] p-3 ring-1 ring-white/5">
              <p className="text-[10px] text-slate-400">{l}</p>
              <p className={`mt-1 text-xl font-semibold ${c}`}>{v}</p>
            </div>
          ))}
          <div className="col-span-2 rounded-lg bg-white/[0.04] p-3 ring-1 ring-white/5">
            <p className="text-[10px] text-slate-400">Order value · last 12 weeks</p>
            <div className="mt-3 flex h-24 items-end gap-1.5">
              {bars.map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-primary/50 to-primary" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="space-y-2 rounded-lg bg-white/[0.04] p-3 ring-1 ring-white/5">
            <p className="text-[10px] text-slate-400">Approval chain</p>
            {[
              ['Territory', 'bg-teal-400'],
              ['Regional', 'bg-teal-400'],
              ['General', 'bg-amber-400'],
            ].map(([l, c]) => (
              <div key={l} className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${c}`} />
                <span className="h-1.5 flex-1 rounded bg-white/10" />
                <span className="text-[9px] text-slate-400">{l}</span>
              </div>
            ))}
          </div>
          <div className="col-span-3 space-y-2 rounded-lg bg-white/[0.04] p-3 ring-1 ring-white/5">
            {['SOR-2026-0136 · Gulf Horizon', 'SOR-2026-0139 · Al Noor', 'SOR-2026-0135 · Maison Rive'].map((r, i) => (
              <div key={r} className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300">{r}</span>
                <span className={['rounded-full bg-amber-400/15 px-2 py-0.5 text-amber-300', 'rounded-full bg-primary/20 px-2 py-0.5 text-indigo-200', 'rounded-full bg-teal-400/15 px-2 py-0.5 text-teal-300'][i]}>
                  {['In approval', 'Final approval', 'Approved'][i]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-surface">
      <div className="bg-midnight text-white">
        <div className="border-b border-white/5 bg-primary/10 px-4 py-2 text-center text-xs text-indigo-100">
          <FlaskConical className="mr-1.5 inline size-3.5 align-[-2px]" />
          {BRAND.demoNotice}
        </div>
        <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Logo dark />
          <nav className="flex items-center gap-2 sm:gap-4">
            <a href="#features" className="hidden text-sm text-slate-300 hover:text-white sm:inline">Features</a>
            <a href="#workflow" className="hidden text-sm text-slate-300 hover:text-white sm:inline">Workflow</a>
            <Link to="/track" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white md:inline">Track application</Link>
            <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white">Sign in</Link>
            <ButtonLink to="/register" size="sm">Become a customer</ButtonLink>
          </nav>
        </header>

        <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-indigo-200">
              <Globe2 className="size-3.5" /> {BRAND.category}
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              {BRAND.tagline.replace('Fulfillment.', '')}
              <span className="bg-gradient-to-r from-[#a5a0ff] to-[#5eead4] bg-clip-text text-transparent">Fulfillment.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-300">
              One portal for international customers and the teams that serve them — registration, ordering, approvals, proforma invoicing, payments and collection, with every handoff visible.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/register" size="lg" iconRight={<ArrowRight className="size-4" />}>Register as customer</ButtonLink>
              <ButtonLink to="/login" size="lg" variant="secondary" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:border-white/25">
                Sign in
              </ButtonLink>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-slate-400">
              {['Permission-based access', 'Configurable approval bands', 'ERP-ready service layer'].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-success" />{t}</li>
              ))}
            </ul>
          </div>
          <HeroPreview />
        </section>
      </div>

      <section id="workflow" className="border-b border-line bg-canvas">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <p className="eyebrow text-center">One continuous workflow</p>
          <ol className="mx-auto mt-8 grid max-w-4xl grid-cols-3 gap-y-8 sm:grid-cols-6">
            {FLOW.map((f, i) => (
              <li key={f.label} className="relative flex flex-col items-center text-center">
                {i < FLOW.length - 1 && <span className="absolute left-1/2 top-6 hidden h-px w-full bg-line-strong sm:block" aria-hidden />}
                <span className="relative flex size-12 items-center justify-center rounded-2xl bg-surface text-primary shadow-sm ring-1 ring-line">
                  <f.icon className="size-5" />
                </span>
                <span className="mt-3 text-[13px] font-medium">{f.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight">Built for distribution teams that span continents</h2>
          <p className="mt-3 text-[15px] text-muted">Every role sees exactly what it needs — customers, coordinators, approvers, finance and logistics — on the same record.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-6">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary-50 text-primary ring-1 ring-primary-100">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-midnight p-8 text-white sm:p-12 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Ready to explore the experience?</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-300">Sign in with a demo account, register a new customer, or track an application you have already submitted.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/login" size="lg" iconRight={<ArrowRight className="size-4" />}>Open the demo</ButtonLink>
            <ButtonLink to="/register" size="lg" variant="secondary" className="border-white/15 bg-white/5 text-white hover:bg-white/10" icon={<FileCheck2 className="size-4" />}>Customer registration</ButtonLink>
            <ButtonLink to="/track" size="lg" variant="secondary" className="border-white/15 bg-white/5 text-white hover:bg-white/10" icon={<Search className="size-4" />}>Track application</ButtonLink>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 px-5 py-6 text-xs text-muted sm:flex-row sm:items-center sm:px-8">
          <span className="flex items-center gap-2"><ShieldCheck className="size-4" /> {BRAND.name} B2B distribution portal · secure sign-in, role-based access.</span>
          <span>© {new Date().getFullYear()} {BRAND.name}</span>
        </div>
      </footer>
    </div>
  )
}
