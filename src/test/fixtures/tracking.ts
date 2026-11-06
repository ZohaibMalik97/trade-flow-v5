/**
 * MOCK implementation of the public tracking service.
 *
 * Runs in the browser against the in-memory demo store, so it can only *model* the
 * required behaviour. Production must perform these checks on the server, which
 * returns nothing but the applicant-safe projection.
 *
 * Modelled controls:
 *  - Reference alone is never enough: email (case-insensitive) or the secure token is required.
 *  - Same generic error for unknown reference, wrong email and wrong token (no enumeration).
 *  - Token links expire; drafts cannot be tracked publicly.
 *  - Simple attempt throttling (per browser session) after repeated failures.
 */
import type { RegistrationApplication, WorkflowDef } from '@/types/domain'
import type { ApplicationTrackingService, TrackingResult } from '@/services/contracts'
import { toPublicView } from '@/workflow/publicView'

export const GENERIC_TRACK_ERROR = 'We could not find an application matching those details. Check the reference number and the email address used to register.'
const MAX_FAILURES = 5
const LOCK_MS = 60_000

const throttle = { failures: 0, lockedUntil: 0 }

const delay = <T,>(v: T, ms = 500) => new Promise<T>((r) => setTimeout(() => r(v), ms))

function normalizeRef(ref: string) {
  return ref.trim().toUpperCase()
}

function guard(): TrackingResult | null {
  if (Date.now() < throttle.lockedUntil) {
    const secs = Math.ceil((throttle.lockedUntil - Date.now()) / 1000)
    return { ok: false, locked: true, error: `Too many unsuccessful attempts. Please wait ${secs} seconds and try again.` }
  }
  return null
}

function fail(): TrackingResult {
  throttle.failures += 1
  if (throttle.failures >= MAX_FAILURES) {
    throttle.lockedUntil = Date.now() + LOCK_MS
    throttle.failures = 0
  }
  return { ok: false, error: GENERIC_TRACK_ERROR }
}

/** Constant-shape comparison (illustrative — real timing-safe compare happens server-side). */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function createMockTrackingService(get: () => { applications: RegistrationApplication[]; workflow: WorkflowDef; applicantEmailOf: (app: RegistrationApplication) => string[] }): ApplicationTrackingService {
  return {
    async trackByEmail(ref, email) {
      const locked = guard()
      if (locked) return delay(locked)
      const { applications, workflow, applicantEmailOf } = get()
      const app = applications.find((a) => a.ref.toUpperCase() === normalizeRef(ref))
      const e = email.trim().toLowerCase()
      if (!app || app.status === 'Draft' || !e || !applicantEmailOf(app).some((x) => safeEqual(x.toLowerCase(), e))) return delay(fail(), 700)
      throttle.failures = 0
      return delay({ ok: true, view: toPublicView(workflow, app) })
    },
    async trackByToken(ref, token) {
      const locked = guard()
      if (locked) return delay(locked)
      const { applications, workflow } = get()
      const app = applications.find((a) => a.ref.toUpperCase() === normalizeRef(ref))
      if (!app || app.status === 'Draft' || !token || !safeEqual(app.trackingToken, token)) return delay(fail(), 700)
      if (new Date(app.trackingTokenExpiresAt).getTime() < Date.now())
        return delay({ ok: false, error: 'This tracking link has expired. Track your application with the reference number and email address instead, or sign in to request a new link.' })
      throttle.failures = 0
      return delay({ ok: true, view: toPublicView(workflow, app) })
    },
  }
}

export const trackingLinkFor = (app: Pick<RegistrationApplication, 'ref' | 'trackingToken'>) => `/track?ref=${encodeURIComponent(app.ref)}&token=${encodeURIComponent(app.trackingToken)}`
