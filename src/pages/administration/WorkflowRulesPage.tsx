import { useState } from 'react'
import { ArrowDown, ArrowUp, BadgeCheck, Bell, Calculator, GitBranch, Lock, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useLookups, useStore } from '@/app/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, DemoTag } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { Notice } from '@/components/ui/misc'
import { Checkbox, SelectField, TextField, Toggle } from '@/components/forms/Field'
import { useToast } from '@/components/ui/Toast'
import { CATEGORIES } from '@/data/reference'
import { defaultApprovalRules, defaultPromoRules } from '@/data/config'
import { calculatePromo } from '@/utils/promo'
import { money, num } from '@/utils/format'
import { uid } from '@/utils/time'
import { cn } from '@/utils/cn'
import type { ApprovalRule, ApprovalStageName, PromoRules, WorkflowDef, WorkflowStageDef } from '@/types/domain'
import { defaultOnboardingWorkflow } from '@/workflow/onboarding'

const STAGES: ApprovalStageName[] = ['Account Manager', 'Regional Manager', 'Head of Sales']

export default function WorkflowRulesPage() {
  const { can } = useStore()
  const [tab, setTab] = useState<'onboarding' | 'approval' | 'promo' | 'notifications'>('onboarding')
  const editable = can('workflow.manage')
  return (
    <>
      <PageHeader title="Workflow rules" description="Customer onboarding stages, sales-order approval bands, tester & sample policy and notification preferences. Changes are saved on the server and apply to new work items." breadcrumbs={[{ label: 'Administration' }, { label: 'Workflow Rules' }]} />
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ key: 'onboarding', label: 'Customer onboarding' }, { key: 'approval', label: 'Sales-order approvals' }, { key: 'promo', label: 'Tester & sample rules' }, { key: 'notifications', label: 'Notification preferences' }]} />
      {!editable && <Notice tone="info" className="mb-4" icon={<Lock className="size-4" />}>Read-only: your role can view workflow configuration but not change it.</Notice>}
      <fieldset disabled={!editable} className="min-w-0">
        {tab === 'onboarding' && <OnboardingWorkflowEditor />}
        {tab === 'approval' && <ApprovalRules />}
        {tab === 'promo' && <PromoRulesEditor />}
        {tab === 'notifications' && <NotificationPrefs />}
      </fieldset>
    </>
  )
}

/** Configurable customer-onboarding stages (conceptually the workflow_stages table). */
function OnboardingWorkflowEditor() {
  const { state, updateOnboardingWorkflow } = useStore()
  const lookups = useLookups()
  const toast = useToast()
  const [def, setDef] = useState<WorkflowDef>(state.onboardingWorkflow)
  const dirty = JSON.stringify(def) !== JSON.stringify(state.onboardingWorkflow)
  const patch = (id: string, p: Partial<WorkflowStageDef>) => setDef({ ...def, stages: def.stages.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  const move = (i: number, d: -1 | 1) => {
    const st = [...def.stages]
    const j = i + d
    if (j < 0 || j >= st.length) return
    ;[st[i], st[j]] = [st[j]!, st[i]!]
    setDef({ ...def, stages: st })
  }
  const inFlight = (id: string) => state.applications.filter((a) => a.currentStageId === id && ['Submitted', 'Under Review', 'Resubmitted', 'Pending Approval'].includes(a.status)).length
  const roleOptions = state.roles.filter((r) => r.audience === 'internal').map((r) => ({ value: r.id, label: r.name }))
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Onboarding stages" description="Applications pass through the active stages in order. The approver of each stage is chosen by its role and assignment rule." icon={<BadgeCheck className="size-5" />} />
        <ol className="divide-y divide-line">
          {def.stages.map((s, i) => {
            const roleHasPerm = lookups.role(s.roleId)?.permissions.includes(s.kind === 'review' ? 'application.review' : 'application.approve')
            return (
              <li key={s.id} className={cn('flex gap-4 px-5 py-4', !s.active && 'bg-canvas/60')}>
                <div className="flex flex-col items-center gap-1 pt-6">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary">{i + 1}</span>
                  <button type="button" aria-label={`Move ${s.name} up`} onClick={() => move(i, -1)} className="rounded p-1 text-muted hover:bg-canvas disabled:opacity-30" disabled={i === 0}><ArrowUp className="size-3.5" /></button>
                  <button type="button" aria-label={`Move ${s.name} down`} onClick={() => move(i, 1)} className="rounded p-1 text-muted hover:bg-canvas disabled:opacity-30" disabled={i === def.stages.length - 1}><ArrowDown className="size-3.5" /></button>
                </div>
                <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <TextField label="Stage name (internal)" value={s.name} onChange={(e) => patch(s.id, { name: e.target.value })} />
                  <TextField label="Label shown to applicant" value={s.publicLabel} onChange={(e) => patch(s.id, { publicLabel: e.target.value })} />
                  <SelectField label="Type" value={s.kind} onChange={(e) => patch(s.id, { kind: e.target.value as WorkflowStageDef['kind'] })} options={[{ value: 'review', label: 'Review (recommend & forward)' }, { value: 'approval', label: 'Approval' }]} />
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <span className="label">Active</span>
                      <Toggle label={`${s.name} active`} checked={s.active} onChange={(v) => patch(s.id, { active: v })} />
                    </div>
                    {inFlight(s.id) > 0 && <Badge tone="info">{inFlight(s.id)} in progress</Badge>}
                  </div>
                  <SelectField label="Responsible role" value={s.roleId} onChange={(e) => patch(s.id, { roleId: e.target.value })} options={roleOptions} />
                  <SelectField label="Assignment rule" value={s.assignment} onChange={(e) => patch(s.id, { assignment: e.target.value as WorkflowStageDef['assignment'] })} options={[{ value: 'review_region', label: 'By review region' }, { value: 'territory_sales_manager', label: 'Territory manager' }, { value: 'role_queue', label: 'Shared role queue' }]} />
                  <TextField label="SLA (hours)" type="number" min={1} value={s.slaHours} onChange={(e) => patch(s.id, { slaHours: Math.max(1, Number(e.target.value) || 1) })} />
                  {!roleHasPerm && <p className="self-end text-xs font-medium text-warning-700">“{lookups.role(s.roleId)?.name}” lacks {s.kind === 'review' ? 'application.review' : 'application.approve'} — the stage cannot be activated.</p>}
                </div>
              </li>
            )
          })}
        </ol>
      </Card>
      <Card>
        <CardHeader title="Return & resubmission policy" icon={<RotateCcw className="size-5" />} />
        <CardBody className="grid gap-5 md:grid-cols-2">
          <SelectField label="After the applicant resubmits, route to" value={def.resubmitRouting} onChange={(e) => setDef({ ...def, resubmitRouting: e.target.value as WorkflowDef['resubmitRouting'] })} options={[{ value: 'returning_stage', label: 'The stage (and reviewer) that returned it' }, { value: 'first_stage', label: 'The first stage (full re-review)' }]} />
          <div className="flex items-center justify-between rounded-lg border border-line p-4">
            <div><p className="text-[13px] font-medium">Allow return to any earlier stage</p><p className="text-xs text-muted">Off: approvers can only return to the immediately previous stage.</p></div>
            <Toggle label="Allow return to any earlier stage" checked={def.allowReturnToAnyPrevious} onChange={(v) => setDef({ ...def, allowReturnToAnyPrevious: v })} />
          </div>
        </CardBody>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas/60 px-5 py-3">
          <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setDef(structuredClone(defaultOnboardingWorkflow))}>Restore defaults</Button>
          <Button
            icon={<Save className="size-4" />}
            disabled={!dirty}
            onClick={async () => {
              const r = await updateOnboardingWorkflow(def)
              if (!r.ok) return toast.error('Not saved', r.error)
              toast.success('Onboarding workflow saved', 'Applies to the next transition of every application.')
            }}
          >
            Save workflow
          </Button>
        </div>
      </Card>
    </div>
  )
}

function ApprovalRules() {
  const { state, updateApprovalRules } = useStore()
  const toast = useToast()
  const [rules, setRules] = useState<ApprovalRule[]>(state.approvalRules)
  const dirty = JSON.stringify(rules) !== JSON.stringify(state.approvalRules)
  const patch = (id: string, p: Partial<ApprovalRule>) => setRules(rules.map((r) => (r.id === id ? { ...r, ...p } : r)))

  const validate = () => {
    const active = rules.filter((r) => r.active).sort((a, b) => a.minValueUsd - b.minValueUsd)
    if (!active.length) return 'At least one rule must be active.'
    if (active.some((r) => r.stages.length === 0)) return 'Every active rule needs at least one approval stage.'
    if (active[0]!.minValueUsd !== 0) return 'The lowest band must start at USD 0.'
    for (let i = 1; i < active.length; i++) if (active[i - 1]!.maxValueUsd !== active[i]!.minValueUsd) return 'Active bands must be contiguous (each max equals the next min).'
    if (active.at(-1)!.maxValueUsd !== null) return 'The highest band must have no upper limit.'
    return undefined
  }
  const error = validate()

  return (
    <Card>
      <CardHeader title="Value-banded approval routing" description="Request value is converted to USD at illustrative FX and matched to one band." icon={<GitBranch className="size-5" />} />
      <div className="divide-y divide-line">
        {rules.map((r) => (
          <div key={r.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1.2fr_1.3fr_2fr_auto] lg:items-end">
            <TextField label="Rule name" value={r.name} onChange={(e) => patch(r.id, { name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Min (USD)" inputMode="numeric" value={r.minValueUsd} onChange={(e) => patch(r.id, { minValueUsd: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
              <TextField label="Max (USD)" inputMode="numeric" placeholder="No limit" value={r.maxValueUsd ?? ''} onChange={(e) => patch(r.id, { maxValueUsd: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} />
            </div>
            <fieldset>
              <legend className="label">Approval stages</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {STAGES.map((s) => (
                  <Checkbox key={s} label={s} checked={r.stages.includes(s)} onChange={() => patch(r.id, { stages: r.stages.includes(s) ? r.stages.filter((x) => x !== s) : STAGES.filter((x) => x === s || r.stages.includes(x)) })} />
                ))}
              </div>
            </fieldset>
            <div className="flex items-end gap-3">
              <TextField label="SLA (h)" inputMode="numeric" className="w-20" value={r.slaHours} onChange={(e) => patch(r.id, { slaHours: Number(e.target.value.replace(/\D/g, '')) || 1 })} />
              <div className="pb-2.5"><Toggle label={`${r.name} active`} checked={r.active} onChange={(v) => patch(r.id, { active: v })} /></div>
              <button type="button" aria-label={`Delete ${r.name}`} onClick={() => setRules(rules.filter((x) => x.id !== r.id))} className="mb-1.5 rounded-md p-1.5 text-muted hover:bg-danger-50 hover:text-danger-700"><Trash2 className="size-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => setRules([...rules, { id: uid('ar'), name: 'New band', minValueUsd: 0, maxValueUsd: null, stages: ['Account Manager'], slaHours: 24, active: false }])}>Add band</Button>
          <Button variant="ghost" size="sm" icon={<RotateCcw className="size-4" />} onClick={() => setRules(defaultApprovalRules)}>Restore defaults</Button>
        </div>
        <div className="flex items-center gap-3">
          {error && <p role="alert" className="text-xs font-medium text-danger-700">{error}</p>}
          <Button icon={<Save className="size-4" />} disabled={!dirty || !!error} onClick={async () => { const r = await updateApprovalRules(rules); if (!r.ok) toast.error('Not saved', r.error); else toast.success('Approval rules saved', 'Applies to requests submitted from now on.') }}>Save rules</Button>
        </div>
      </div>
      <div className="border-t border-line bg-canvas/60 px-5 py-4">
        <p className="eyebrow mb-2">Preview</p>
        <div className="flex flex-wrap gap-2">
          {[10_000, 40_000, 150_000].map((v) => {
            const rule = rules.filter((r) => r.active).find((r) => v >= r.minValueUsd && (r.maxValueUsd === null || v < r.maxValueUsd))
            return <Badge key={v} tone="neutral">{money(v, 'USD', { compact: true })} → {rule ? rule.stages.join(' → ') : 'no rule'}</Badge>
          })}
        </div>
      </div>
    </Card>
  )
}

function PromoRulesEditor() {
  const { state, updatePromoRules } = useStore()
  const toast = useToast()
  const [r, setR] = useState<PromoRules>(state.promoRules)
  const [units, setUnits] = useState(48)
  const dirty = JSON.stringify(r) !== JSON.stringify(state.promoRules)
  const n = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, '')) || 0)
  const sample = calculatePromo([{ productId: state.products[0]?.id ?? '', quantity: units, unitPrice: 0 }], state.products, r)

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader title="Tester & sample allocation" description="Free-of-charge items added to each request based on eligible fragrance units." actions={<DemoTag>Illustrative policy</DemoTag>} />
        <CardBody className="space-y-4">
          <Notice tone="warning" title="Policy not yet confirmed">These values are placeholders for stakeholder review. Allocation rounds down and is calculated on the whole request (see README for assumptions).</Notice>
          <div className="flex items-center justify-between rounded-lg border border-line p-4">
            <div><p className="text-[13px] font-medium">Allocation enabled</p><p className="text-xs text-muted">When off, requests carry no testers or samples.</p></div>
            <Toggle label="Allocation enabled" checked={r.enabled} onChange={(v) => setR({ ...r, enabled: v })} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="One tester per … eligible units" inputMode="numeric" value={r.testerPerUnits} onChange={(e) => setR({ ...r, testerPerUnits: n(e.target.value) })} />
            <TextField label="Sample size (ml)" inputMode="decimal" value={r.sampleSizeMl} onChange={(e) => setR({ ...r, sampleSizeMl: n(e.target.value) })} />
            <TextField label="Samples per block" inputMode="numeric" value={r.samplesPerBlock} onChange={(e) => setR({ ...r, samplesPerBlock: n(e.target.value) })} />
            <TextField label="Block size (eligible units)" inputMode="numeric" value={r.sampleBlockUnits} onChange={(e) => setR({ ...r, sampleBlockUnits: n(e.target.value) })} />
            <TextField label="Policy version label" className="sm:col-span-2" value={r.version} onChange={(e) => setR({ ...r, version: e.target.value })} />
          </div>
          <fieldset>
            <legend className="label">Eligible categories</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {CATEGORIES.map((c) => (
                <Checkbox key={c} label={c} checked={r.eligibleCategories.includes(c)} onChange={() => setR({ ...r, eligibleCategories: r.eligibleCategories.includes(c) ? r.eligibleCategories.filter((x) => x !== c) : [...r.eligibleCategories, c] })} />
              ))}
            </div>
          </fieldset>
        </CardBody>
        <div className="flex justify-between gap-2 border-t border-line px-5 py-4">
          <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setR(defaultPromoRules)}>Restore defaults</Button>
          <Button icon={<Save className="size-4" />} disabled={!dirty || r.testerPerUnits < 1 || r.sampleBlockUnits < 1} onClick={async () => { const res = await updatePromoRules(r); if (!res.ok) return toast.error('Not saved', res.error); toast.success('Tester & sample rules saved', 'Applied to new and edited requests.') }}>Save rules</Button>
        </div>
      </Card>
      <Card className="h-fit">
        <CardHeader title="Calculator" icon={<Calculator className="size-5" />} description="Try the rule before saving" />
        <CardBody className="space-y-4">
          <TextField label="Eligible fragrance units" inputMode="numeric" value={units} onChange={(e) => setUnits(n(e.target.value))} />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-primary-50/60 p-4 text-center"><p className="text-xs text-primary-700">Testers</p><p className="text-2xl font-semibold tabular">{num(sample.testers)}</p></div>
            <div className="rounded-lg bg-primary-50/60 p-4 text-center"><p className="text-xs text-primary-700">Samples</p><p className="text-2xl font-semibold tabular">{num(sample.samples)}</p><p className="text-[11px] text-muted">× {r.sampleSizeMl} ml</p></div>
          </div>
          <p className="text-xs text-muted">Formula: testers = ⌊units ÷ {r.testerPerUnits || '—'}⌋; samples = ⌊units ÷ {r.sampleBlockUnits || '—'}⌋ × {r.samplesPerBlock}.</p>
        </CardBody>
      </Card>
    </div>
  )
}

function NotificationPrefs() {
  const { state, toggleNotificationPref } = useStore()
  const lookups = useLookups()
  return (
    <Card>
      <CardHeader title="Notification preferences" description="Default channels per event. Email is delivered by the server's background sender when email is enabled." icon={<Bell className="size-5" />} />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-canvas/70 text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="px-5 py-2.5">Event</th>
              <th className="px-3 py-2.5">Audience</th>
              <th className="px-3 py-2.5 text-center">In-app</th>
              <th className="px-5 py-2.5 text-center">Email</th>
            </tr>
          </thead>
          <tbody>
            {state.notificationPrefs.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="px-5 py-3"><p className="font-medium">{p.event}</p><p className="text-xs text-muted">{p.description}</p></td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{p.roles.map((r) => <Badge key={r} tone="neutral">{lookups.role(r)?.name ?? r}</Badge>)}</div></td>
                <td className="px-3 py-3 text-center"><Toggle label={`${p.event} in-app`} checked={p.inApp} onChange={() => toggleNotificationPref(p.id, 'inApp')} /></td>
                <td className="px-5 py-3 text-center"><Toggle label={`${p.event} email`} checked={p.email} onChange={() => toggleNotificationPref(p.id, 'email')} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
