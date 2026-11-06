/**
 * Application state store — backed by the TradeFlow API.
 *
 * Every record shown in the UI is loaded from the ASP.NET Core API (SQL Server via stored procedures), already
 * filtered to what the signed-in user may see. Actions call the API; the server re-validates permissions, record
 * scope and business rules on every call, then the affected collections are reloaded. Browser-side permission
 * checks only shape the UI — they are never a security boundary.
 *
 * The state shape and the exported selectors are unchanged from the prototype so pages keep working as before.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  AdminAuditEntry,
  AppNotification,
  ApplicationContent,
  ApplicationDocument,
  ApprovalRule,
  ApprovalStep,
  Address,
  Contact,
  Customer,
  CustomerActivity,
  CustomerStatus,
  DemoCredential,
  DemoUser,
  DocumentRecord,
  EmailThread,
  FollowUpStatus,
  GoodsReceiptAck,
  IntegrationChannel,
  IntegrationEvent,
  NotificationPreference,
  OrderLine,
  Payment,
  Product,
  ProformaInvoice,
  PromoRules,
  RegistrationApplication,
  Role,
  SalesOrderRequest,
  Session,
  Shipment,
  Territory,
  WorkflowDef,
} from '@/types/domain'
import { regions, applyReference, applyTerritories, setDemoAccounts } from '@/data/reference'
import { roundMoney } from '@/utils/fx'
import { defaultRoles } from '@/auth/roles'
import { customerScope as customerScopeOf, GUEST, makeCan, ORDER_STAGE_ROLE, permissionsFor, type Can } from '@/auth/authorize'
import { defaultOnboardingWorkflow } from '@/workflow/onboarding'
import { stageById, type ReviewerAction, type ReviewerInput, type WorkflowCtx } from '@/workflow/engine'
import type { PublicApplicationView } from '@/workflow/publicView'
import type { ApplicationTrackingService } from '@/services/contracts'
import { refreshSapModeLabels } from '@/services'
import { setSapMode } from '@/services/api/http'
import { api, ApiError, hasAccessToken, refreshSession, setAccessToken, setSessionExpiredHandler } from '@/services/api/client'
import { defaultApprovalRules, defaultNotificationPrefs, defaultPromoRules } from '@/data/config'

// ─── State shape ──────────────────────────────────────────────────────────

export interface CartItem {
  productId: string
  quantity: number
}

/** Server-resolved identity of the signed-in user (from GET /auth/me). */
export interface ServerPrincipal {
  permissions: string[]
  assignedTerritoryIds: string[]
  customerIds: string[]
  sessionId?: string
}

export interface SystemInfo {
  environment: string
  demoEnabled: boolean
  sapMode: 'mock' | 'live'
  sapModeLabel: string
  emailEnabled: boolean
  version: string
}

export interface DemoState {
  version: number
  session?: Session
  me?: ServerPrincipal
  system?: SystemInfo
  /** True once the first load after sign-in has finished. */
  loaded: boolean
  users: DemoUser[]
  roles: Role[]
  /** Not used with the API (passwords are verified by the server); kept for type compatibility. */
  credentials: DemoCredential[]
  loginAttempts: Record<string, { failures: number; lockedUntil?: string }>
  territories: Territory[]
  products: Product[]
  customers: Customer[]
  applications: RegistrationApplication[]
  onboardingWorkflow: WorkflowDef
  requests: SalesOrderRequest[]
  invoices: ProformaInvoice[]
  payments: Payment[]
  shipments: Shipment[]
  documents: DocumentRecord[]
  threads: EmailThread[]
  notifications: AppNotification[]
  promoRules: PromoRules
  approvalRules: ApprovalRule[]
  notificationPrefs: NotificationPreference[]
  integrationEvents: IntegrationEvent[]
  integrationChannels: IntegrationChannel[]
  adminAudit: AdminAuditEntry[]
  activities: CustomerActivity[]
  goodsReceipts: GoodsReceiptAck[]
  cart: CartItem[]
  cartCustomerId?: string
  counters: Record<string, number>
}

export const SESSION_HOURS = 8
const CART_KEY = 'tradeflow-cart'

function emptyState(): DemoState {
  return {
    version: 1,
    loaded: false,
    users: [],
    roles: defaultRoles,
    credentials: [],
    loginAttempts: {},
    territories: [],
    products: [],
    customers: [],
    applications: [],
    onboardingWorkflow: defaultOnboardingWorkflow,
    requests: [],
    invoices: [],
    payments: [],
    shipments: [],
    documents: [],
    threads: [],
    notifications: [],
    promoRules: defaultPromoRules,
    approvalRules: defaultApprovalRules,
    notificationPrefs: defaultNotificationPrefs,
    integrationEvents: [],
    integrationChannels: [],
    adminAudit: [],
    activities: [],
    goodsReceipts: [],
    cart: loadCart(),
    counters: {},
  }
}

/** The cart is a per-browser convenience (never business data); everything else lives on the server. */
function loadCart(): CartItem[] {
  try {
    return JSON.parse(sessionStorage.getItem(CART_KEY) ?? '[]') as CartItem[]
  } catch {
    return []
  }
}

// ─── Results ──────────────────────────────────────────────────────────────

export interface GoodsReceiptInput {
  deliveryNumber: string
  /** yyyy-mm-dd */
  receivedOn: string
  remarks?: string
  lines: { itemNo: number; receivedQty: number; damagedQty: number; note?: string }[]
}

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }
const fail = (error: string) => ({ ok: false as const, error })
const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong. Please try again.')

// ─── Pure helpers / selectors (server data is already scoped to the user) ──

export function currentUserOf(s: Pick<DemoState, 'session' | 'users'>): DemoUser {
  const sess = s.session
  if (!sess) return GUEST
  const u = s.users.find((x) => x.id === sess.userId)
  return u && u.active ? u : GUEST
}

const isMe = (s: Pick<DemoState, 'session'>, user: DemoUser) => !!s.session && s.session.userId === user.id

/** The current user's permissions come from the server; other users' are derived from role grants (admin screens). */
export const permissionsOf = (s: Pick<DemoState, 'roles' | 'session' | 'me'>, user: DemoUser) =>
  isMe(s, user) && s.me ? new Set(s.me.permissions) : permissionsFor(s.roles, user)
export const canFor = (s: Pick<DemoState, 'roles' | 'session' | 'me'>, user: DemoUser): Can => makeCan(permissionsOf(s, user))

export const workflowCtx = (s: DemoState): WorkflowCtx => ({ workflow: s.onboardingWorkflow, users: s.users, roles: s.roles, territories: s.territories, regions })

function assignedTerritories(s: DemoState, user: DemoUser): Set<string> {
  if (isMe(s, user) && s.me) return new Set(s.me.assignedTerritoryIds)
  const out = new Set<string>(user.territoryIds ?? [])
  if (user.regionId) s.territories.filter((t) => t.regionId === user.regionId).forEach((t) => out.add(t.id))
  return out
}

/** Territory ids whose records the user may see. */
export function territoriesInScope(s: DemoState, user: DemoUser, can: Can): string[] {
  if (can('customer.view_all') || can('order.view_all')) return s.territories.map((t) => t.id)
  const out = assignedTerritories(s, user)
  for (const c of s.customers) if (s.me?.customerIds.includes(c.id)) out.add(c.territoryId)
  return [...out]
}

/** Customer ids the user may see — for the signed-in user this is exactly what the server returned. */
export const customerScope = (s: DemoState, user: DemoUser, can: Can) =>
  isMe(s, user) ? new Set(s.customers.map((c) => c.id)) : customerScopeOf(s, user, can)

export const stageRoleOf = (s: DemoState) => (stageId?: string) => stageById(s.onboardingWorkflow, stageId)?.roleId

/** The server only returns applications the user may open. */
export const visibleApplications = (s: DemoState, _user: DemoUser, _can: Can) => s.applications

/** The server only returns the user's own notifications. */
export const notificationsFor = (s: Pick<DemoState, 'notifications'>, _user: DemoUser) => s.notifications

export function rulesForValue(rules: ApprovalRule[], valueUsd: number) {
  const active = rules.filter((r) => r.active).sort((a, b) => a.minValueUsd - b.minValueUsd)
  return active.find((r) => valueUsd >= r.minValueUsd && (r.maxValueUsd === null || r.maxValueUsd === undefined || valueUsd < r.maxValueUsd)) ?? active.at(-1)!
}

/** Preview of the approver for a stage (the server assigns the real approver when the request is submitted). */
export function approverIdFor(s: DemoState, stage: ApprovalStep['stage'], territoryId: string) {
  const t = s.territories.find((x) => x.id === territoryId)
  if (stage === 'Account Manager') return t?.managerId ?? ''
  if (stage === 'Regional Manager') return regions.find((r) => r.id === t?.regionId)?.managerId ?? ''
  return s.users.find((u) => u.active && u.roleIds.includes('head_of_sales'))?.id ?? ''
}

const ORDER_DECISION_PERMS = ['order.approve', 'order.reject', 'order.return_to_requester', 'order.return_to_previous_approver']

/** Can the user act on the request's current approval step? (same rule as the server's ApprovalEngine.CanActOn) */
export function canActOn(s: DemoState, user: DemoUser, r: SalesOrderRequest, can: Can = canFor(s, user)) {
  if (r.status !== 'Pending Approval') return false
  const step = r.approvalSteps.find((x) => x.status === 'Pending')
  if (!step || !ORDER_DECISION_PERMS.some(can)) return false
  if (!user.roleIds.includes(ORDER_STAGE_ROLE[step.stage])) return false
  if (step.approverId === user.id) return true
  if (step.stage === 'Head of Sales') return true
  return assignedTerritories(s, user).has(r.territoryId)
}

/** May the user submit (or retry) this internally approved request to SAP? */
export function canSubmitToSap(s: DemoState, user: DemoUser, r: SalesOrderRequest, can: Can = canFor(s, user)) {
  if (r.status !== 'Approved' || !r.sap || r.sap.inFlight) return false
  if (r.sap.status !== 'Pending SAP Creation' && r.sap.status !== 'SAP Creation Failed') return false
  if (!can('order.sap_submit')) return false
  return customerScope(s, user, can).has(r.customerId)
}

export const pendingStep = (r: SalesOrderRequest) => r.approvalSteps.find((x) => x.status === 'Pending')

export const requestTotal = (r: Pick<SalesOrderRequest, 'lines'>) => roundMoney(r.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0))

export function applicantEmailsOf(s: Pick<DemoState, 'users'>, app: RegistrationApplication) {
  const owner = s.users.find((u) => u.id === app.applicantUserId)
  return [app.contact.email, owner?.email].filter((x): x is string => !!x)
}

// ─── Action inputs ────────────────────────────────────────────────────────

export interface RequestDraftInput {
  id?: string
  customerId: string
  lines: OrderLine[]
  fulfilment: SalesOrderRequest['fulfilment']
  deliveryAddress?: SalesOrderRequest['deliveryAddress']
  collectionWarehouse?: string
  requestedDate: string
  customerPo?: string
  notes?: string
}

export type ApprovalDecision = 'approve' | 'reject' | 'changes' | 'return_previous'

export interface NewFile {
  name: string
  type: ApplicationDocument['type']
  sizeKb: number
  file?: File
}

export interface ApplicantRegistrationInput {
  account: { name: string; title: string; email: string; password: string }
  content: ApplicationContent
  documents: NewFile[]
  submit: boolean
}

export interface ApplicationEditInput {
  content: ApplicationContent
  addDocuments?: NewFile[]
  supersedeDocumentIds?: string[]
}

export interface UserInput {
  name: string
  email: string
  title: string
  kind: DemoUser['kind']
  department?: string
  roleIds: string[]
  territoryIds?: string[]
  regionId?: string
  reviewRegionIds?: string[]
  customerId?: string
  active: boolean
}

export interface NewDocumentInput {
  name: string
  type: DocumentRecord['type']
  linkedTo: DocumentRecord['linkedTo']
  customerId?: string
  sizeKb: number
  status?: DocumentRecord['status']
  expiresAt?: string
  file?: File
}

export const MIN_REMARK = 10

type Collection =
  | 'users' | 'roles' | 'territories' | 'products' | 'customers' | 'applications' | 'workflow' | 'requests' | 'invoices' | 'payments' | 'shipments'
  | 'documents' | 'threads' | 'notifications' | 'promo' | 'approvalRules' | 'notificationPrefs' | 'integration' | 'audit' | 'activities' | 'receipts' | 'reference'

const ALL: Collection[] = ['reference', 'users', 'roles', 'territories', 'products', 'customers', 'applications', 'workflow', 'requests', 'invoices', 'payments', 'shipments', 'documents', 'threads', 'notifications', 'promo', 'approvalRules', 'notificationPrefs', 'integration', 'audit', 'activities', 'receipts']

interface StoreApi {
  state: DemoState
  user: DemoUser
  isAuthenticated: boolean
  /** True while the session is being restored on page load. */
  restoring: boolean
  permissions: Set<string>
  can: Can
  canAny: (...p: string[]) => boolean
  tracking: ApplicationTrackingService
  /** Reload collections from the server (all when omitted). */
  reload: (...what: Collection[]) => Promise<void>
  resetDemo: () => Promise<Result>
  // auth
  login: (email: string, password: string) => Promise<Result<{ user: DemoUser; mustChangePassword: boolean }>>
  logout: () => Promise<void>
  changePassword: (current: string, next: string) => Promise<Result>
  requestPasswordReset: (email: string) => Promise<Result>
  resetPassword: (token: string, password: string) => Promise<Result>
  // notifications
  markNotificationRead: (id: string, read?: boolean) => Promise<void>
  markAllNotificationsRead: () => Promise<void>
  // cart (browser-only convenience)
  addToCart: (productId: string, qty: number) => void
  setCartQty: (productId: string, qty: number) => void
  removeFromCart: (productId: string) => void
  clearCart: () => void
  // requests
  saveDraft: (input: RequestDraftInput) => Promise<Result<{ id: string; ref: string }>>
  submitRequest: (input: RequestDraftInput, idempotencyKey?: string) => Promise<Result<{ id: string; ref: string }>>
  decideApproval: (requestId: string, decision: ApprovalDecision, comment: string) => Promise<Result<{ finalApproved?: boolean; sapQueued?: boolean }>>
  submitToSap: (requestId: string) => Promise<Result<{ outcome: 'confirmed' | 'partially_confirmed' | 'failed' | 'existing_returned'; message: string }>>
  cancelRequest: (requestId: string, comment: string) => Promise<Result>
  addRequestComment: (requestId: string, comment: string, internal?: boolean) => Promise<Result>
  confirmGoodsReceipt: (input: GoodsReceiptInput) => Promise<Result<{ ref: string; discrepancy: boolean }>>
  resolveReceiptDiscrepancy: (ackId: string, resolution: string) => Promise<Result>
  // customer applications
  registerApplicant: (input: ApplicantRegistrationInput) => Promise<Result<{ appId: string; ref: string; trackingLink: string }>>
  saveOwnApplication: (appId: string, input: ApplicationEditInput) => Promise<Result>
  submitOwnApplication: (appId: string) => Promise<Result>
  resubmitOwnApplication: (appId: string, note: string) => Promise<Result>
  applicationAction: (appId: string, action: ReviewerAction, input: ReviewerInput) => Promise<Result>
  commentOnApplication: (appId: string, text: string) => Promise<Result>
  renewTrackingLink: (appId: string) => Promise<Result<{ link: string }>>
  setCustomerStatus: (id: string, status: CustomerStatus, comment: string) => Promise<Result>
  // finance
  issueInvoice: (requestId: string) => Promise<Result>
  uploadReceipt: (invoiceId: string, file: { name: string; sizeKb: number; file?: File }, meta: { valueDate: string; payerBank: string; amount?: number }) => Promise<Result>
  verifyPayment: (paymentId: string, decision: 'verify' | 'reject', note: string) => Promise<Result>
  // logistics
  advanceShipment: (shipmentId: string, note?: string) => Promise<Result>
  // documents
  addDocument: (doc: NewDocumentInput) => Promise<Result>
  // email
  sendEmail: (input: { threadId?: string; subject: string; to: { name: string; email: string }[]; body: string; attachments: { name: string; sizeKb: number; documentId?: string; file?: File }[]; customerId: string; requestId?: string }) => Promise<Result<{ threadId: string }>>
  markThreadRead: (threadId: string, unread?: boolean) => Promise<void>
  setFollowUp: (threadId: string, status: FollowUpStatus, dueAt?: string, note?: string) => Promise<Result>
  linkThread: (threadId: string, customerId: string, requestId?: string) => Promise<Result>
  // admin
  updatePromoRules: (rules: PromoRules) => Promise<Result>
  updateApprovalRules: (rules: ApprovalRule[]) => Promise<Result>
  // customers & sales activities
  updateOwnProfile: (input: { contacts: Contact[]; deliveryAddress: Address }) => Promise<Result>
  reassignCustomerTerritory: (customerId: string, territoryId: string, reason: string) => Promise<Result>
  setSapMapping: (customerId: string, businessPartner: string) => Promise<Result>
  logActivity: (input: Omit<CustomerActivity, 'id' | 'territoryId' | 'ownerId' | 'createdAt'>) => Promise<Result<{ id: string }>>
  updateActivity: (id: string, patch: Partial<Pick<CustomerActivity, 'status' | 'outcome' | 'notes' | 'nextActionAt'>>) => Promise<Result>
  toggleNotificationPref: (id: string, channel: 'inApp' | 'email') => Promise<Result>
  createUser: (input: UserInput, password: string) => Promise<Result<{ id: string }>>
  updateUser: (id: string, patch: Partial<UserInput>) => Promise<Result>
  resetUserPassword: (id: string, password: string) => Promise<Result>
  unlockUser: (id: string) => Promise<Result>
  createRole: (input: { name: string; description: string; audience: Role['audience']; permissions: string[] }) => Promise<Result<{ id: string }>>
  updateRole: (id: string, patch: { name?: string; description?: string }) => Promise<Result>
  deleteRole: (id: string) => Promise<Result>
  setRolePermission: (roleId: string, permission: string, granted: boolean) => Promise<Result>
  updateOnboardingWorkflow: (def: WorkflowDef) => Promise<Result>
  updateTerritory: (id: string, patch: Partial<Pick<Territory, 'managerId' | 'visibleBrandIds'>>) => Promise<Result>
  setIntegrationEvent: (event: IntegrationEvent) => void
}

const StoreContext = createContext<StoreApi | null>(null)

const enc = encodeURIComponent

/** GET that resolves to `fallback` when the user may not read the collection (403) — the UI then simply shows nothing. */
async function safe<T>(path: string, fallback: T): Promise<T> {
  try {
    return await api.get<T>(path)
  } catch (e) {
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) return fallback
    throw e
  }
}

const multipart = (data: unknown, files: { file?: File; type: string }[]) => {
  const form = new FormData()
  form.append('data', JSON.stringify(data))
  for (const f of files) {
    if (!f.file) continue
    form.append('files', f.file, f.file.name)
    form.append('fileTypes', f.type)
  }
  return form
}

/** Public application tracking through the API (rate-limited and logged server-side). */
const trackingService: ApplicationTrackingService = {
  async trackByEmail(ref, email) {
    return track({ ref, email })
  },
  async trackByToken(ref, token) {
    return track({ ref, token })
  },
}

async function track(body: { ref: string; email?: string; token?: string }) {
  try {
    const r = await api.post<{ ok: boolean; view?: PublicApplicationView; error?: string; locked?: boolean }>('/public/track', body)
    return r.ok && r.view ? { ok: true as const, view: r.view } : { ok: false as const, error: r.error ?? 'We could not find an application with these details.', locked: r.locked }
  } catch (e) {
    return { ok: false as const, error: messageOf(e), locked: e instanceof ApiError && e.status === 429 }
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(emptyState)
  const stateRef = useRef(state)
  const [restoring, setRestoring] = useState(true)

  const commit = useCallback((recipe: (draft: DemoState) => void) => {
    const next = { ...stateRef.current }
    recipe(next)
    stateRef.current = next
    setState(next)
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(CART_KEY, JSON.stringify(state.cart))
    } catch {
      /* storage unavailable */
    }
  }, [state.cart])

  const loadSystem = useCallback(async () => {
    try {
      const info = await api.get<SystemInfo>('/system/info')
      setSapMode(info.sapMode)
      refreshSapModeLabels()
      setDemoAccounts(info.demoEnabled ? DEMO_ACCOUNT_LIST : [])
      commit((d) => void (d.system = info))
    } catch {
      /* the API is unreachable — sign-in will report it */
    }
  }, [commit])

  /** Loads (or reloads) the given collections in parallel. */
  const reload = useCallback(async (...what: Collection[]) => {
    const s0 = stateRef.current
    if (!s0.session) return
    const can = (p: string) => !!s0.me?.permissions.includes(p)
    const want = new Set(what.length ? what : ALL)
    const tasks: Promise<(d: DemoState) => void>[] = []
    const add = <T,>(c: Collection, load: () => Promise<T>, apply: (d: DemoState, v: T) => void) => {
      if (want.has(c)) tasks.push(load().then((v) => (d: DemoState) => apply(d, v)))
    }
    add('reference', () => api.get<Parameters<typeof applyReference>[0]>('/reference'), (d, v) => applyReference(v, d.territories))
    add('users', () => (can('user.view') || can('user.manage') ? api.get<DemoUser[]>('/users') : safe<DemoUser[]>('/users/directory', [])), (d, v) => void (d.users = v))
    add('roles', () => safe<Role[]>('/roles', defaultRoles), (d, v) => void (d.roles = v))
    add('territories', () => safe<Territory[]>('/territories', []), (d, v) => {
      d.territories = v
      applyTerritories(v)
    })
    add('products', () => safe<Product[]>(`/products${can('catalog.manage') ? '?includeInactive=true' : ''}`, []), (d, v) => void (d.products = v))
    add('customers', () => safe<Customer[]>('/customers', []), (d, v) => void (d.customers = v))
    add('applications', () => safe<RegistrationApplication[]>('/applications', []), (d, v) => void (d.applications = v))
    add('workflow', () => safe<WorkflowDef>('/config/onboarding-workflow', defaultOnboardingWorkflow), (d, v) => void (d.onboardingWorkflow = v))
    add('requests', () => safe<SalesOrderRequest[]>('/requests', []), (d, v) => void (d.requests = v))
    add('invoices', () => safe<ProformaInvoice[]>('/invoices', []), (d, v) => void (d.invoices = v))
    add('payments', () => safe<Payment[]>('/payments', []), (d, v) => void (d.payments = v))
    add('shipments', () => safe<Shipment[]>('/shipments', []), (d, v) => void (d.shipments = v))
    add('documents', () => safe<DocumentRecord[]>('/documents', []), (d, v) => void (d.documents = v))
    add('threads', () => safe<EmailThread[]>('/email/threads', []), (d, v) => void (d.threads = v))
    add('notifications', () => safe<AppNotification[]>('/notifications', []), (d, v) => void (d.notifications = v))
    add('promo', () => safe<PromoRules>('/config/promo-rules', defaultPromoRules), (d, v) => void (d.promoRules = v))
    add('approvalRules', () => safe<ApprovalRule[]>('/config/approval-rules', defaultApprovalRules), (d, v) => void (d.approvalRules = v))
    add('notificationPrefs', () => safe<NotificationPreference[]>('/config/notification-events', []), (d, v) => void (d.notificationPrefs = v))
    add('integration', () => Promise.all([safe<IntegrationEvent[]>('/integration/events', []), safe<IntegrationChannel[]>('/integration/channels', [])]), (d, v) => {
      d.integrationEvents = v[0]
      d.integrationChannels = v[1]
    })
    add('audit', () => safe<AdminAuditEntry[]>('/audit/recent?take=1000', []), (d, v) => void (d.adminAudit = v))
    add('activities', () => safe<CustomerActivity[]>('/activities', []), (d, v) => void (d.activities = v))
    add('receipts', () => safe<GoodsReceiptAck[]>('/sap/goods-receipts', []), (d, v) => void (d.goodsReceipts = v))
    const appliers = await Promise.allSettled(tasks)
    commit((d) => {
      // Territories first so reference data (countries, warehouses) can use them.
      for (const a of appliers) if (a.status === 'fulfilled') a.value(d)
      d.loaded = true
    })
  }, [commit])

  /** Loads the principal (permissions + scope) and then all data. */
  const startSession = useCallback(async () => {
    const me = await api.get<{ user: DemoUser; permissions: string[]; assignedTerritoryIds: string[]; customerIds: string[]; sessionId?: string }>('/auth/me')
    commit((d) => {
      d.session = { userId: me.user.id, issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString() }
      d.me = { permissions: me.permissions, assignedTerritoryIds: me.assignedTerritoryIds, customerIds: me.customerIds, sessionId: me.sessionId }
      d.users = [me.user, ...d.users.filter((u) => u.id !== me.user.id)]
    })
    await reload()
    return me.user
  }, [commit, reload])

  const clearSession = useCallback(() => {
    setAccessToken(null)
    const sys = stateRef.current.system
    const next = { ...emptyState(), system: sys, cart: [] }
    stateRef.current = next
    setState(next)
  }, [])

  // Restore an existing session (refresh cookie) on page load.
  useEffect(() => {
    setSessionExpiredHandler(() => clearSession())
    let cancelled = false
    void (async () => {
      await loadSystem()
      try {
        if (await refreshSession()) await startSession()
      } catch {
        if (!cancelled) clearSession()
      } finally {
        if (!cancelled) setRestoring(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadSystem, startSession, clearSession])

  // Keep notifications and work queues fresh while the app is open.
  useEffect(() => {
    if (!state.session) return
    const t = setInterval(() => void reload('notifications', 'requests', 'applications'), 60_000)
    const onFocus = () => void reload('notifications', 'requests', 'applications', 'payments', 'shipments')
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [state.session, reload])

  const user = currentUserOf(state)
  const permissions = useMemo(() => permissionsOf(state, user), [state, user])

  const api$ = useMemo<StoreApi>(() => {
    /** Runs an API call, reloads the affected collections, and maps errors to a Result. */
    const run = async <T extends object = object>(call: () => Promise<T | void>, ...affected: Collection[]): Promise<Result<T>> => {
      try {
        const v = (await call()) ?? ({} as T)
        if (affected.length) await reload(...affected)
        return { ok: true, ...(v as T) }
      } catch (e) {
        return fail(messageOf(e))
      }
    }
    const setCart = (fn: (cart: CartItem[]) => CartItem[]) => commit((d) => void (d.cart = fn(d.cart)))
    const draftBody = (input: RequestDraftInput) => ({
      id: input.id,
      customerId: input.customerId,
      lines: input.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      fulfilment: input.fulfilment,
      deliveryAddress: input.fulfilment === 'Delivery' ? input.deliveryAddress : undefined,
      collectionWarehouse: input.fulfilment === 'Collection' ? input.collectionWarehouse : undefined,
      requestedDate: input.requestedDate,
      customerPo: input.customerPo,
      notes: input.notes,
      version: stateRef.current.requests.find((r) => r.id === input.id)?.version,
    })
    const versionOf = (requestId: string) => stateRef.current.requests.find((r) => r.id === requestId)?.version

    return {
      state,
      user,
      isAuthenticated: user.id !== GUEST.id,
      restoring,
      permissions,
      can: makeCan(permissions),
      canAny: (...p) => p.some((x) => permissions.has(x)),
      tracking: trackingService,
      reload,

      resetDemo: () => run(() => api.post('/system/demo/reset'), ...ALL),

      // ── Authentication ──
      login: async (email, password) => {
        try {
          const r = await api.post<{ accessToken: string; user: DemoUser; mustChangePassword: boolean }>('/auth/login', { email: email.trim(), password })
          setAccessToken(r.accessToken)
          const u = await startSession()
          return { ok: true, user: u, mustChangePassword: r.mustChangePassword }
        } catch (e) {
          setAccessToken(null)
          return fail(messageOf(e))
        }
      },
      logout: async () => {
        try {
          await api.post('/auth/logout')
        } catch {
          /* already signed out on the server */
        }
        clearSession()
      },
      changePassword: (current, next) => run(() => api.post('/auth/change-password', { currentPassword: current, newPassword: next })),
      requestPasswordReset: (email) => run(() => api.post('/auth/forgot-password', { email: email.trim() })),
      resetPassword: (token, password) => run(() => api.post('/auth/reset-password', { token, newPassword: password })),

      markNotificationRead: async (id, read = true) => {
        commit((d) => void (d.notifications = d.notifications.map((n) => (n.id === id ? { ...n, read } : n))))
        await run(() => api.post(`/notifications/${enc(id)}/read`, { read }))
      },
      markAllNotificationsRead: async () => {
        commit((d) => void (d.notifications = d.notifications.map((n) => ({ ...n, read: true }))))
        await run(() => api.post('/notifications/read-all'))
      },

      addToCart: (productId, qty) =>
        setCart((c) => (c.some((x) => x.productId === productId) ? c.map((x) => (x.productId === productId ? { ...x, quantity: x.quantity + qty } : x)) : [...c, { productId, quantity: qty }])),
      setCartQty: (productId, qty) =>
        setCart((c) => (qty <= 0 ? c.filter((x) => x.productId !== productId) : c.some((x) => x.productId === productId) ? c.map((x) => (x.productId === productId ? { ...x, quantity: qty } : x)) : [...c, { productId, quantity: qty }])),
      removeFromCart: (productId) => setCart((c) => c.filter((x) => x.productId !== productId)),
      clearCart: () => setCart(() => []),

      // ── Sales requests ──
      saveDraft: (input) => run(() => api.post<{ id: string; ref: string }>('/requests/drafts', draftBody(input)), 'requests'),
      submitRequest: async (input, idempotencyKey) => {
        const r = await run(
          () => api.post<{ id: string; ref: string }>('/requests/submit', draftBody(input), { 'Idempotency-Key': idempotencyKey ?? crypto.randomUUID() }),
          'requests', 'notifications',
        )
        if (r.ok) setCart(() => [])
        return r
      },
      decideApproval: async (requestId, decision, comment) => {
        const r = await run(
          () => api.post<{ finalApproved: boolean; sapSubmissionQueued: boolean }>(`/requests/${enc(requestId)}/decisions/${decision}`, { comment, version: versionOf(requestId) }),
          'requests', 'notifications',
        )
        return r.ok ? { ok: true, finalApproved: r.finalApproved, sapQueued: r.sapSubmissionQueued } : r
      },
      submitToSap: (requestId) =>
        run(() => api.post<{ outcome: 'confirmed' | 'partially_confirmed' | 'failed' | 'existing_returned'; message: string }>(`/requests/${enc(requestId)}/sap-submission`), 'requests', 'shipments', 'integration', 'notifications'),
      cancelRequest: (requestId, comment) => run(() => api.post(`/requests/${enc(requestId)}/cancel`, { comment }), 'requests'),
      addRequestComment: (requestId, comment, internal) => run(() => api.post(`/requests/${enc(requestId)}/comments`, { comment, internal: !!internal }), 'requests'),
      confirmGoodsReceipt: (input) =>
        run(() => api.post<{ id: string; ref: string; discrepancy: boolean }>('/sap/goods-receipts', input), 'receipts', 'notifications'),
      resolveReceiptDiscrepancy: (ackId, resolution) => run(() => api.post(`/sap/goods-receipts/${enc(ackId)}/resolve`, { resolution }), 'receipts'),

      // ── Customer applications ──
      registerApplicant: async (input) => {
        try {
          const form = multipart({ account: input.account, content: input.content, submit: input.submit }, input.documents)
          const r = await api.form<{ appId: string; ref: string; trackingLink: string; auth: { accessToken: string } }>('/public/registrations', form)
          setAccessToken(r.auth.accessToken)
          await startSession()
          return { ok: true, appId: r.appId, ref: r.ref, trackingLink: r.trackingLink }
        } catch (e) {
          return fail(messageOf(e))
        }
      },
      saveOwnApplication: (appId, input) =>
        run(() => api.form(`/applications/${enc(appId)}`, multipart({ content: input.content, supersedeDocumentIds: input.supersedeDocumentIds }, input.addDocuments ?? []), 'PUT'), 'applications'),
      submitOwnApplication: (appId) => run(() => api.post(`/applications/${enc(appId)}/submit`), 'applications', 'notifications'),
      resubmitOwnApplication: (appId, note) => run(() => api.post(`/applications/${enc(appId)}/resubmit`, { note }), 'applications', 'notifications'),
      applicationAction: (appId, action, input) =>
        run(() => api.post(`/applications/${enc(appId)}/actions/${enc(action)}`, input), 'applications', 'notifications', 'customers', 'users', 'integration'),
      commentOnApplication: (appId, text) => run(() => api.post(`/applications/${enc(appId)}/comments`, { text }), 'applications'),
      renewTrackingLink: (appId) => run(() => api.post<{ link: string }>(`/applications/${enc(appId)}/tracking-link`), 'applications'),
      setCustomerStatus: (id, status, comment) => run(() => api.put(`/customers/${enc(id)}/status`, { status, comment }), 'customers'),

      // ── Finance ──
      issueInvoice: (requestId) => run(() => api.post('/invoices', { requestId }), 'invoices', 'payments', 'requests', 'shipments', 'documents'),
      uploadReceipt: (invoiceId, file, meta) => {
        if (!file.file) return Promise.resolve(fail('Choose the receipt file to upload.'))
        const form = new FormData()
        form.append('file', file.file, file.file.name)
        form.append('valueDate', meta.valueDate)
        form.append('payerBank', meta.payerBank)
        if (meta.amount !== undefined) form.append('amount', String(meta.amount))
        return run(() => api.form(`/invoices/${enc(invoiceId)}/receipts`, form), 'invoices', 'payments', 'requests', 'documents')
      },
      verifyPayment: (paymentId, decision, note) =>
        run(() => api.post(`/payments/${enc(paymentId)}/verification`, { decision, note }), 'payments', 'invoices', 'requests', 'shipments', 'documents'),

      // ── Logistics ──
      advanceShipment: (shipmentId, note) =>
        run(() => api.post(`/shipments/${enc(shipmentId)}/advance`, { note, expectedStatus: stateRef.current.shipments.find((x) => x.id === shipmentId)?.status }), 'shipments', 'requests', 'documents'),

      // ── Documents ──
      addDocument: (doc) => {
        if (!doc.file) return Promise.resolve(fail('Choose a file to upload.'))
        const form = new FormData()
        form.append('file', doc.file, doc.file.name)
        form.append('type', doc.type)
        form.append('linkedKind', doc.linkedTo.kind)
        form.append('linkedId', doc.linkedTo.id)
        if (doc.expiresAt) form.append('expiresAt', doc.expiresAt.slice(0, 10))
        return run(() => api.form('/documents', form), 'documents', 'shipments')
      },

      // ── Communications ──
      sendEmail: async (input) => {
        const r = await run(async () => {
          // New local files are stored as documents first (file storage on the server) so the e-mail references real content.
          const attachments: { name: string; sizeKb: number; documentId?: string }[] = []
          for (const a of input.attachments) {
            if (a.file && !a.documentId) {
              const form = new FormData()
              form.append('file', a.file, a.name)
              form.append('type', 'Correspondence')
              form.append('linkedKind', input.requestId ? 'request' : 'customer')
              form.append('linkedId', input.requestId ?? input.customerId)
              const doc = await api.form<{ id: string; name: string; sizeKb: number }>('/documents', form)
              attachments.push({ name: doc.name, sizeKb: doc.sizeKb, documentId: doc.id })
            } else attachments.push({ name: a.name, sizeKb: a.sizeKb, documentId: a.documentId })
          }
          return api.post<{ threadId: string; messageId: string; deliveryStatus: string }>('/email/messages', { ...input, attachments })
        }, 'threads', 'documents')
        return r.ok ? { ok: true, threadId: r.threadId } : r
      },
      markThreadRead: async (threadId, unread = false) => {
        commit((d) => void (d.threads = d.threads.map((t) => (t.id === threadId ? { ...t, unread } : t))))
        await run(() => api.patch(`/email/threads/${enc(threadId)}`, { unread }))
      },
      setFollowUp: (threadId, status, dueAt, note) => run(() => api.put(`/email/threads/${enc(threadId)}/follow-up`, { status, dueAt, note }), 'threads'),
      linkThread: (threadId, customerId, requestId) => run(() => api.put(`/email/threads/${enc(threadId)}/link`, { customerId, requestId }), 'threads'),

      // ── Configuration ──
      updatePromoRules: (rules) => run(() => api.put('/config/promo-rules', rules), 'promo', 'audit'),
      updateApprovalRules: (rules) => run(() => api.put('/config/approval-rules', rules), 'approvalRules', 'audit'),

      // ── Customers & activities ──
      updateOwnProfile: (input) => run(() => api.put('/customers/me/profile', input), 'customers'),
      reassignCustomerTerritory: (customerId, territoryId, reason) => run(() => api.post(`/customers/${enc(customerId)}/territory`, { territoryId, reason }), 'customers', 'requests', 'activities'),
      setSapMapping: (customerId, businessPartner) => run(() => api.put(`/customers/${enc(customerId)}/sap-mapping`, { businessPartner }), 'customers'),
      logActivity: (input) => run(() => api.post<{ id: string }>('/activities', input), 'activities'),
      updateActivity: (id, patch) => run(() => api.patch(`/activities/${enc(id)}`, { ...patch, fields: Object.keys(patch) }), 'activities'),
      toggleNotificationPref: (id, channel) => run(() => api.post(`/config/notification-events/${enc(id)}/toggle`, { channel }), 'notificationPrefs'),

      // ── Administration ──
      createUser: (input, password) => run(() => api.post<{ id: string }>('/users', { user: input, password }), 'users', 'audit'),
      updateUser: (id, patch) => run(() => api.patch(`/users/${enc(id)}`, patch), 'users', 'audit'),
      resetUserPassword: (id, password) => run(() => api.post(`/users/${enc(id)}/reset-password`, { password }), 'users', 'audit'),
      unlockUser: (id) => run(() => api.post(`/users/${enc(id)}/unlock`), 'users', 'audit'),
      createRole: (input) => run(() => api.post<{ id: string }>('/roles', input), 'roles', 'audit'),
      updateRole: (id, patch) => run(() => api.patch(`/roles/${enc(id)}`, patch), 'roles', 'audit'),
      deleteRole: (id) => run(() => api.del(`/roles/${enc(id)}`), 'roles', 'users', 'audit'),
      setRolePermission: async (roleId, permission, granted) => {
        const r = await run(() => api.put(`/roles/${enc(roleId)}/permissions/${enc(permission)}`, { granted }), 'roles', 'audit')
        // Changing one's own role takes effect immediately on the server — refresh the principal too.
        if (r.ok && stateRef.current.users.find((u) => u.id === stateRef.current.session?.userId)?.roleIds.includes(roleId)) await startSession()
        return r
      },
      updateOnboardingWorkflow: (def) => run(() => api.put('/config/onboarding-workflow', def), 'workflow', 'audit'),
      updateTerritory: (id, patch) => run(() => api.patch(`/territories/${enc(id)}`, patch), 'territories', 'audit'),
      setIntegrationEvent: (event) => commit((d) => void (d.integrationEvents = d.integrationEvents.map((e) => (e.id === event.id ? event : e)))),
    }
  }, [state, user, permissions, restoring, reload, commit, startSession, clearSession])

  return <StoreContext.Provider value={api$}>{children}</StoreContext.Provider>
}

/** Demo accounts of the UAT dataset (90_Seed_Demo.sql). Shown only when the server reports demo mode; the password is never shipped in the bundle. */
const DEMO_ACCOUNT_LIST = [
  { userId: '1000', email: 'omar.haddad@gulfhorizon.example', label: 'Customer Portal User', description: 'Catalogue, prices & stock, sales requests, own profile' },
  { userId: '1003', email: 'priya.nair@tradeflow.example', label: 'Customer Onboarding Approver', description: 'Approves registrations · also Operations (invoices, payments, shipments)' },
  { userId: '1001', email: 'daniel.okafor@tradeflow.example', label: 'Sales Representative / Account Manager', description: 'Approves Gulf customers’ sales requests, initiates SAP submission' },
  { userId: '1002', email: 'marcus.chen@tradeflow.example', label: 'Head of Sales', description: 'Second-level approval of elevated requests; all territories' },
  { userId: '1004', email: 'elena.petrova@tradeflow.example', label: 'Administrator', description: 'Users, roles, permissions, configuration, audit' },
]

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}

/** True when an access token exists (used by route guards while the session is restored). */
export const hasSession = () => hasAccessToken()

// ─── Convenience lookup hook ──────────────────────────────────────────────

export function useLookups() {
  const { state } = useStore()
  return useMemo(() => {
    const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]))
    const customers = byId(state.customers)
    const products = byId(state.products)
    const users = byId(state.users)
    const territories = byId(state.territories)
    const roles = byId(state.roles)
    const brandMap = byId(brandsLive())
    const regionMap = byId(regions)
    return {
      customer: (id?: string) => (id ? customers.get(id) : undefined),
      product: (id: string) => products.get(id),
      user: (id?: string) => (id ? users.get(id) : undefined),
      role: (id?: string) => (id ? roles.get(id) : undefined),
      territory: (id?: string) => (id ? territories.get(id) : undefined),
      brand: (id: string) => brandMap.get(id),
      region: (id?: string) => (id ? regionMap.get(id) : undefined),
      request: (id?: string) => state.requests.find((r) => r.id === id),
      invoice: (id?: string) => state.invoices.find((r) => r.id === id),
      shipment: (id?: string) => state.shipments.find((r) => r.id === id),
    }
  }, [state])
}

import { brands as liveBrands } from '@/data/reference'
const brandsLive = () => liveBrands
