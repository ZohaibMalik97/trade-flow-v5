/**
 * Unit tests for the workflow engine, applicant-safe projection, authorization helpers
 * and the mock tracking service. These call the rules directly (bypassing the UI),
 * which is how a server-side implementation would have to enforce them.
 */
import { describe, expect, it } from 'vitest'
import { applications as seedApps } from './fixtures/applications'
import { regions, territories, users } from './fixtures/org'
import { defaultRoles } from '@/auth/roles'
import { assignedTerritoryIds, canViewApplication, customerScope as customerScopeFn, makeCan, permissionsFor } from '@/auth/authorize'
import { customers } from './fixtures/customers'
import { defaultOnboardingWorkflow } from '@/workflow/onboarding'
import { applyReviewerAction, availableActions, eligiblePreviousStages, resubmit, submitDraft, type WorkflowCtx } from '@/workflow/engine'
import { toPublicView } from '@/workflow/publicView'
import { createMockTrackingService, GENERIC_TRACK_ERROR } from './fixtures/tracking'
import type { RegistrationApplication, WorkflowDef } from '@/types/domain'

const ctx = (workflow: WorkflowDef = defaultOnboardingWorkflow): WorkflowCtx => ({ workflow: structuredClone(workflow), users, roles: defaultRoles, territories, regions })
const user = (id: string) => users.find((u) => u.id === id)!
const canOf = (id: string) => makeCan(permissionsFor(defaultRoles, user(id)))
const app = (id: string) => structuredClone(seedApps.find((a) => a.id === id)!) as RegistrationApplication

describe('availability and authorization', () => {
  it('only the assigned onboarding approver gets actions; sales roles and admin get none', () => {
    const a = app('a-001') // Under Review, assigned to Priya (onboarding approver)
    expect(availableActions(ctx(), user('u-sc'), canOf('u-sc'), a).map((x) => x.action)).toContain('approve')
    expect(availableActions(ctx(), user('u-tm1'), canOf('u-tm1'), a)).toEqual([]) // sales rep: no onboarding rights
    expect(availableActions(ctx(), user('u-gm'), canOf('u-gm'), a)).toEqual([]) // head of sales: no onboarding rights
    expect(availableActions(ctx(), user('u-admin'), canOf('u-admin'), a)).toEqual([]) // admin: view only
  })

  it('refuses a transition by a user outside the stage even when called directly', () => {
    const a = app('a-001')
    const r = applyReviewerAction(ctx(), a, user('u-gm'), canOf('u-gm'), 'approve', {})
    expect(r.ok).toBe(false)
    expect(a.status).toBe('Under Review')
    expect(a.history).toHaveLength(app('a-001').history.length)
  })

  it('onboarding permissions and sales-approval permissions are separate', () => {
    expect(canOf('u-sc')('application.approve')).toBe(true)
    expect(canOf('u-sc')('order.approve')).toBe(false)
    expect(canOf('u-tm1')('order.approve')).toBe(true)
    expect(canOf('u-tm1')('application.approve')).toBe(false)
    expect(canOf('u-dist')('order.approve')).toBe(false)
    expect(canOf('u-dist')('order.sap_submit')).toBe(false)
  })

  it('blocks decisions until the review is started', () => {
    const a = app('a-003')
    const r = applyReviewerAction(ctx(), a, user('u-sc'), canOf('u-sc'), 'approve', {})
    expect(r).toEqual({ ok: false, error: 'Start the review first.' })
  })

  it('first stage has no previous approver', () => {
    const a = app('a-003')
    expect(eligiblePreviousStages(ctx(), a)).toEqual([])
    const roles = defaultRoles.map((r) => (r.id === 'onboarding_approver' ? { ...r, permissions: [...r.permissions, 'application.return_to_previous_approver'] } : r))
    const c = { ...ctx(), roles }
    const can = makeCan(permissionsFor(roles, user('u-sc')))
    applyReviewerAction(c, a, user('u-sc'), can, 'start_review', {})
    const ret = availableActions(c, user('u-sc'), can, a).find((x) => x.action === 'return_to_previous')!
    expect(ret.allowed).toBe(false)
    expect(ret.reason).toMatch(/no previous approver/)
  })

  it('record-level visibility follows ownership, assignment, territory and history', () => {
    const stageRole = (id?: string) => defaultOnboardingWorkflow.stages.find((s) => s.id === id)?.roleId
    const terr = (id: string) => assignedTerritoryIds({ territories, customers }, user(id))
    expect(canViewApplication(user('u-tm1'), canOf('u-tm1'), app('a-007'), stageRole, terr('u-tm1'))).toBe(true) // Bahrain, own territory
    expect(canViewApplication(user('u-tm1'), canOf('u-tm1'), app('a-003'), stageRole, terr('u-tm1'))).toBe(false) // UK
    expect(canViewApplication(user('u-tm1'), canOf('u-tm1'), app('a-001'), stageRole, terr('u-tm1'))).toBe(false) // Saudi
    expect(canViewApplication(user('u-sc'), canOf('u-sc'), app('a-003'), stageRole)).toBe(true) // assigned approver
    expect(canViewApplication(user('u-app2'), canOf('u-app2'), app('a-001'), stageRole)).toBe(false) // other applicant
    expect(canViewApplication(user('u-gm'), canOf('u-gm'), app('a-001'), stageRole)).toBe(true) // Head of Sales: view_all (read only)
    const draft = { ...app('a-001'), status: 'Draft' as const, applicantUserId: 'u-app1' }
    expect(canViewApplication(user('u-gm'), canOf('u-gm'), draft, stageRole)).toBe(false) // drafts are private
  })

  it('a customer only ever sees its own account', () => {
    const scope = (id: string) => [...(customerScopeFn({ territories, customers }, user(id), canOf(id)))]
    expect(scope('u-dist')).toEqual(['c-001'])
    expect(scope('u-tm1').sort()).toEqual(['c-001', 'c-003', 'c-009', 'c-010'])
    expect(scope('u-gm')).toHaveLength(customers.length)
  })
})

describe('transitions', () => {
  it('mandatory remarks for reject and return', () => {
    const a = app('a-001')
    const pr = user('u-sc')
    expect(applyReviewerAction(ctx(), a, pr, canOf('u-sc'), 'reject', { publicRemarks: 'no' }).ok).toBe(false)
    expect(applyReviewerAction(ctx(), a, pr, canOf('u-sc'), 'return_to_requester', { publicRemarks: 'Please fix the address details.' }).ok).toBe(false) // no sections
  })

  it('the onboarding approver can reject with a reason; internal remarks stay internal', () => {
    const a = app('a-001')
    const r = applyReviewerAction(ctx(), a, user('u-sc'), canOf('u-sc'), 'reject', { publicRemarks: 'Trade licence does not cover wholesale.', remarks: 'SECRET internal note' })
    expect(r.ok).toBe(true)
    expect(a.status).toBe('Rejected')
    expect(JSON.stringify(toPublicView(defaultOnboardingWorkflow, a))).not.toContain('SECRET')
  })

  it('single-stage approval is final; history is append-only', () => {
    const a = app('a-006')
    const before = structuredClone(a.history)
    const r = applyReviewerAction(ctx(), a, user('u-sc'), canOf('u-sc'), 'approve', { publicRemarks: 'Welcome aboard.' })
    expect(r).toMatchObject({ ok: true, finalApproved: true })
    expect(a.status).toBe('Approved')
    expect(a.history.slice(0, before.length)).toEqual(before)
  })

  it('correction → resubmit increments the revision and routes back to the returning reviewer', () => {
    const a = app('a-003')
    applyReviewerAction(ctx(), a, user('u-sc'), canOf('u-sc'), 'start_review', {})
    applyReviewerAction(ctx(), a, user('u-sc'), canOf('u-sc'), 'return_to_requester', { publicRemarks: 'Upload the current VAT certificate.', editableSections: ['documents'] })
    expect(a.status).toBe('Returned for Information')
    const r = resubmit(ctx(), a, user('u-app3'), 'Uploaded')
    expect(r.ok).toBe(true)
    expect(a.revision).toBe(2)
    expect(a.revisions.map((x) => x.revision)).toEqual([1, 2])
    expect(a.status).toBe('Resubmitted')
    expect(a.assignedToUserId).toBe('u-sc')
  })

  it('an activated optional stage becomes part of the route', () => {
    const wf = structuredClone(defaultOnboardingWorkflow)
    const fin = wf.stages.find((s) => s.id === 'final_approval')!
    fin.active = true
    fin.roleId = 'onboarding_approver'
    const a = app('a-006')
    const r = applyReviewerAction(ctx(wf), a, user('u-sc'), canOf('u-sc'), 'approve', {})
    expect(r).toMatchObject({ ok: true })
    expect(a.currentStageId).toBe('final_approval')
    expect(a.status).not.toBe('Approved')
  })

  it('draft submission refuses non-drafts', () => {
    expect(submitDraft(ctx(), app('a-001'), user('u-app1')).ok).toBe(false)
  })
})

describe('public tracking (mock service)', () => {
  const a = app('a-002')
  const svc = createMockTrackingService(() => ({ applications: [a], workflow: defaultOnboardingWorkflow, applicantEmailOf: (x) => [x.contact.email] }))
  it('requires reference + matching email; errors are generic', async () => {
    expect((await svc.trackByEmail(a.ref, 'neema@lagoonbeauty.example')).ok).toBe(true)
    expect(await svc.trackByEmail(a.ref, 'x@y.example')).toMatchObject({ ok: false, error: GENERIC_TRACK_ERROR })
    expect(await svc.trackByEmail('APP-2026-9999', 'neema@lagoonbeauty.example')).toMatchObject({ ok: false, error: GENERIC_TRACK_ERROR })
  })
  it('token links must match and not be expired', async () => {
    expect((await svc.trackByToken(a.ref, a.trackingToken)).ok).toBe(true)
    expect((await svc.trackByToken(a.ref, 'nope')).ok).toBe(false)
    a.trackingTokenExpiresAt = new Date(Date.now() - 1000).toISOString()
    expect(await svc.trackByToken(a.ref, a.trackingToken)).toMatchObject({ ok: false, error: expect.stringContaining('expired') })
  })
  it('the public projection never contains internal remarks', () => {
    const v = toPublicView(defaultOnboardingWorkflow, app('a-004'))
    const internal = app('a-004').history.map((e) => e.remarks).filter(Boolean)
    for (const r of internal) expect(JSON.stringify(v)).not.toContain(r!)
  })
})
