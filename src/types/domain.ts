/**
 * TradeFlow domain model.
 * These types describe what the UI needs. They are deliberately independent of
 * SAP structures so that a future integration layer can map S/4HANA objects
 * (Business Partner, Sales Document, Billing Document, Delivery…) onto them.
 */

export type ID = string
export type ISODate = string
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'AED' | 'SAR' | 'QAR' | 'SGD'

// ─── People & organisation ────────────────────────────────────────────────

/**
 * Roles are configurable data (see Administration › Roles). Built-in role ids are
 * listed in `src/auth/roles.ts`; administrators can add custom roles at runtime.
 */
export type RoleId = string
/** Permission identifiers, e.g. `application.approve`. Catalog: `src/auth/permissions.ts`. */
export type PermissionId = string

export interface Role {
  id: RoleId
  name: string
  description: string
  /** Built-in roles cannot be deleted; critical permissions of protected roles are locked. */
  system: boolean
  /** External roles are used by customer / applicant companies. */
  audience: 'internal' | 'external'
  permissions: PermissionId[]
}

/**
 * Prototype user record. Maps conceptually to `users` + `user_roles` + `user_assignments`.
 * Record-level access is derived from these assignments, not from the role name alone.
 */
export interface DemoUser {
  id: ID
  name: string
  email: string
  title: string
  /** One or more roles (user_roles). */
  roleIds: RoleId[]
  kind: 'internal' | 'external'
  department?: string
  /** Assignment: territories (e.g. territory managers). */
  territoryIds?: ID[]
  /** Assignment: region (e.g. regional managers). */
  regionId?: ID
  /** Assignment: regions whose customer applications this user reviews. */
  reviewRegionIds?: ID[]
  /** Assignment: customer account for external customer users. */
  customerId?: ID
  active: boolean
  lastActiveAt: ISODate
  createdAt?: ISODate
}

/** Prototype-only credential record. Production: server-side identity provider. */
export interface DemoCredential {
  userId: ID
  /** Non-cryptographic demo hash — never use this pattern in production. */
  hash: string
}

export interface Session {
  userId: ID
  issuedAt: ISODate
  expiresAt: ISODate
}

/** Administrative audit entry (user, role, permission, workflow and territory changes). */
export interface AdminAuditEntry {
  id: ID
  at: ISODate
  actorId: ID
  area: 'user' | 'role' | 'permission' | 'workflow' | 'territory' | 'auth' | 'customer'
  action: string
  target: string
  details?: string
}

export interface Region {
  id: ID
  name: string
  managerId: ID
}

export interface Territory {
  id: ID
  name: string
  regionId: ID
  countries: string[]
  managerId: ID
  defaultCurrency: CurrencyCode
  /** Brand ids that customers in this territory may see and order. */
  visibleBrandIds: ID[]
}

// ─── Catalogue ────────────────────────────────────────────────────────────

export interface Brand {
  id: ID
  name: string
  origin: string
  /** Accent hue used to render product visuals. */
  hue: number
}

export type ProductCategory =
  | 'Eau de Parfum'
  | 'Extrait de Parfum'
  | 'Eau de Toilette'
  | 'Body Mist'
  | 'Home Fragrance'
  | 'Gift Set'

export type StockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock' | 'Pre-order' | 'Unknown'

export interface Product {
  id: ID
  sku: string
  name: string
  brandId: ID
  category: ProductCategory
  sizeMl: number
  /** Illustrative list price in USD. */
  unitPriceUsd: number
  availableQty: number
  stockStatus: StockStatus
  /** Minimum order quantity / case pack. */
  casePack: number
  notes: string
  /** Visual style seed for the fallback illustration (used when there is no product image). */
  bottle: 'tall' | 'round' | 'square' | 'jar' | 'box'
  isNew?: boolean
  /** SAP material number this product maps to (product ↔ SAP mapping). */
  sapMaterial: string
  /** Sales unit of measure (price is per this unit), e.g. EA, SET. */
  uom: string
  /** Unit of measure in which stock is held. */
  stockUom: string
  description: string
  /**
   * Product image URL from the product master / DAM. None of the seeded products has one —
   * the UI then shows a labelled illustration instead of an invented photo.
   */
  imageUrl?: string
}

// ─── Customers & registration ─────────────────────────────────────────────

export type CustomerStatus = 'Active' | 'Pending Review' | 'On Hold' | 'Blocked'

export interface Address {
  line1: string
  line2?: string
  city: string
  region?: string
  postalCode?: string
  country: string
}

export interface Contact {
  id: ID
  name: string
  role: string
  email: string
  phone: string
  primary?: boolean
}

export interface Customer {
  /** Server concurrency token (SQL rowversion) — sent back with updates. */
  version?: string
  id: ID
  code: string
  name: string
  legalName: string
  country: string
  city: string
  territoryId: ID
  status: CustomerStatus
  crNumber: string
  taxNumber: string
  currency: CurrencyCode
  paymentTerms: string
  creditLimit: number
  brandIds: ID[]
  contacts: Contact[]
  billingAddress: Address
  deliveryAddress: Address
  customerSince: ISODate
  /** Legacy display reference (kept for compatibility). The SAP mapping is `sapBusinessPartner`. */
  externalRef?: string
  /**
   * Customer ↔ SAP mapping: the SAP sold-to Business Partner number. Deliberately separate from the
   * TradeFlow id/code — they are never assumed to be equal. Undefined until the BP exists in SAP.
   */
  sapBusinessPartner?: string
  accountManagerId: ID
  tier: 'Platinum' | 'Gold' | 'Silver' | 'New'
  /** Territory assignments over time. Changing territory never resets the account or its transactions. */
  territoryHistory?: { territoryId: ID; from: ISODate; to?: ISODate; byId: ID; reason?: string }[]
  /** Last self-service profile update by the customer. */
  profileUpdatedAt?: ISODate
}

// ─── Sales activities (visits, calls, follow-ups) ────────────────────────

export type ActivityType = 'Visit' | 'Call' | 'Meeting' | 'Follow-up' | 'Email'

export interface CustomerActivity {
  id: ID
  customerId: ID
  /** Territory at the time of the activity (kept for territory reporting). */
  territoryId: ID
  type: ActivityType
  subject: string
  notes?: string
  outcome?: string
  /** When the activity took place (or is planned). */
  at: ISODate
  status: 'Planned' | 'Completed' | 'Cancelled'
  nextActionAt?: ISODate
  ownerId: ID
  createdAt: ISODate
}

// ─── Customer applications (onboarding workflow) ──────────────────────

export const APPLICATION_STATUSES = [
  'Draft',
  'Submitted',
  'Under Review',
  'Returned for Information',
  'Resubmitted',
  'Pending Approval',
  'Approved',
  'Rejected',
] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

/** Sections of the customer application that a reviewer can re-open for correction. */
export type ApplicationSection = 'company' | 'contact' | 'brands' | 'addresses' | 'documents'

export interface ApplicationDocument {
  id: ID
  name: string
  type: DocumentType
  sizeKb: number
  uploadedAt: ISODate
  /** Revision in which the file was added. */
  revision: number
  /** Superseded files are kept for history but are no longer current. */
  supersededAt?: ISODate
  supersededInRevision?: number
}

/** Editable business content of an application (what the applicant fills in). */
export interface ApplicationContent {
  companyName: string
  legalName: string
  crNumber: string
  taxNumber: string
  country: string
  city: string
  territoryId: ID
  website?: string
  businessType: string
  annualVolumeBand: string
  contact: Omit<Contact, 'id'>
  requestedBrandIds: ID[]
  billingAddress: Address
  deliveryAddress: Address
}

export type WorkflowActionType =
  | 'save_draft'
  | 'submit'
  | 'assign'
  | 'start_review'
  | 'approve'
  | 'reject'
  | 'return_to_requester'
  | 'request_clarification'
  | 'return_to_previous'
  | 'resubmit'
  | 'respond_clarification'
  | 'account_created'
  /** Internal reviewer note — no status change, never shown to the applicant. */
  | 'comment'

/**
 * One immutable row of application_workflow_history.
 * `remarks` are internal (reviewers only); `publicRemarks` are shown to the applicant.
 */
export interface WorkflowEvent {
  id: ID
  at: ISODate
  /** User id; 'system' for automatic events. */
  actorId: ID
  action: WorkflowActionType
  fromStatus?: ApplicationStatus
  toStatus: ApplicationStatus
  fromStageId?: string
  toStageId?: string
  /** Destination user for assignments and returns. */
  toUserId?: ID
  remarks?: string
  publicRemarks?: string
  /** Applicant-visible events appear on the public tracking timeline. */
  visibility: 'public' | 'internal'
  revision: number
}

export interface ApplicationReturnInfo {
  type: 'correction' | 'clarification'
  fromStageId: string
  byUserId: ID
  at: ISODate
  instructions: string
  /** Sections the applicant may edit (correction only). */
  editableSections: ApplicationSection[]
}

export interface ApplicationRevision {
  revision: number
  submittedAt: ISODate
  content: ApplicationContent
}

export interface RegistrationApplication extends ApplicationContent {
  /** Server concurrency token (SQL rowversion) — sent back with updates. */
  version?: string
  id: ID
  ref: string
  workflowId: string
  status: ApplicationStatus
  /** Applicant user (owner). */
  applicantUserId?: ID
  createdAt: ISODate
  /** First submission time (undefined while Draft). */
  submittedAt?: ISODate
  updatedAt: ISODate
  /** Current workflow stage while the application is with reviewers. */
  currentStageId?: string
  /** Current assignee (user) for the stage; undefined = role queue or applicant. */
  assignedToUserId?: ID
  stageEnteredAt?: ISODate
  returnInfo?: ApplicationReturnInfo
  documents: ApplicationDocument[]
  revision: number
  revisions: ApplicationRevision[]
  history: WorkflowEvent[]
  /** Secure tracking link token (prototype). Production: hashed server-side, emailed to applicant. */
  trackingToken: string
  trackingTokenExpiresAt: ISODate
  customerId?: ID
}

export interface WorkflowStageDef {
  id: string
  name: string
  /** Label shown to applicants on the tracking page. */
  publicLabel: string
  kind: 'review' | 'approval'
  /** Role whose members may act on this stage. */
  roleId: RoleId
  /** How the stage is assigned to a specific user. */
  assignment: 'review_region' | 'territory_sales_manager' | 'role_queue'
  slaHours: number
  active: boolean
}

export interface WorkflowDef {
  id: string
  name: string
  stages: WorkflowStageDef[]
  /** Where a resubmitted application goes. */
  resubmitRouting: 'returning_stage' | 'first_stage'
  /** Allow returning to any earlier stage (otherwise only the immediately previous one). */
  allowReturnToAnyPrevious: boolean
}

// ─── Sales order requests ─────────────────────────────────────────────────

export type RequestStatus =
  | 'Draft'
  | 'Submitted'
  | 'Pending Approval'
  | 'Returned for Clarification'
  | 'Approved'
  | 'Rejected'
  | 'Awaiting Payment'
  | 'Payment Verified'
  | 'In Fulfillment'
  | 'Ready for Collection'
  | 'Collected'
  | 'Cancelled'

export type ApprovalStageName = 'Account Manager' | 'Regional Manager' | 'Head of Sales'

export type ApprovalStepStatus =
  | 'Waiting'
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Returned for Clarification'
  /** Sent back to this level by a later approver (shown in step history). */
  | 'Returned'

export interface ApprovalStep {
  stage: ApprovalStageName
  approverId: ID
  status: ApprovalStepStatus
  slaHours: number
  enteredAt?: ISODate
  actedAt?: ISODate
  actedById?: ID
  comment?: string
  /** Earlier decisions at this level, kept when a later approver returns the request here. */
  history?: { status: ApprovalStepStatus; actedAt?: ISODate; actedById?: ID; comment?: string; reopenedAt: ISODate; reopenedById: ID }[]
}

export interface OrderLine {
  productId: ID
  quantity: number
  /** Unit price in the request currency at the time of the request. */
  unitPrice: number
}

export interface PromoAllocation {
  eligibleUnits: number
  testers: number
  samples: number
  ruleVersion: string
}

export interface ActivityEntry {
  id: ID
  at: ISODate
  actorId: ID
  action: string
  comment?: string
  kind: 'system' | 'user' | 'approval' | 'rejection' | 'change' | 'finance' | 'logistics' | 'return'
  /** Internal comment — visible to staff only, never to the customer. */
  internal?: boolean
}

export type FulfilmentMode = 'Delivery' | 'Collection'

/**
 * Customer acknowledgement that goods of an SAP delivery arrived. Stored in TradeFlow.
 * It is NOT an SAP goods receipt and does not change any SAP document.
 */
export interface GoodsReceiptAck {
  id: ID
  /** TradeFlow confirmation reference, e.g. GRC-2026-0001. */
  ref: string
  deliveryNumber: string
  soNumber: string
  customerId: ID
  receivedOn: ISODate
  confirmedAt: ISODate
  confirmedById: ID
  remarks?: string
  lines: { itemNo: number; productId: ID; description: string; deliveredQty: number; receivedQty: number; damagedQty: number; note?: string }[]
  outcome: 'Received in full' | 'Received with discrepancy'
  discrepancy?: { status: 'Open' | 'Resolved'; routedTo: string; resolvedById?: ID; resolvedAt?: ISODate; resolution?: string }
  /** Whether an SAP update follows the acknowledgement. Not configured in this process. */
  sapUpdate: 'Not required — customer acknowledgement only'
}

export interface SalesOrderRequest {
  /** Server concurrency token (SQL rowversion) — sent back with updates. */
  version?: string
  id: ID
  ref: string
  customerId: ID
  territoryId: ID
  currency: CurrencyCode
  lines: OrderLine[]
  promo: PromoAllocation
  status: RequestStatus
  approvalSteps: ApprovalStep[]
  fulfilment: FulfilmentMode
  deliveryAddress?: Address
  collectionWarehouse?: string
  requestedDate: ISODate
  customerPo?: string
  notes?: string
  createdAt: ISODate
  updatedAt: ISODate
  createdById: ID
  activity: ActivityEntry[]
  invoiceId?: ID
  shipmentId?: ID
  /** SAP sales document number once SAP has accepted the order (mock-generated in development mode). */
  externalRef?: string
  /**
   * SAP submission record — deliberately separate from internal approval.
   * Absent until the request is internally approved.
   */
  sap?: SapSubmission
}

/** SAP submission lifecycle (requirements §9). Internal approval ≠ SAP submission ≠ SAP confirmation. */
export type SapSubmissionStatus = 'Pending SAP Creation' | 'SAP Creation Failed' | 'Sales Order Created'

export interface SapSubmissionAttempt {
  at: ISODate
  byId: ID
  outcome: 'confirmed' | 'partially_confirmed' | 'failed' | 'existing_returned'
  /** Which integration produced this response. 'mock' = development mode, nothing left the browser. */
  mode: 'mock' | 'live'
  documentNumber?: string
  errorCode?: string
  message: string
}

export interface SapSubmission {
  status: SapSubmissionStatus
  /** True while a call is in flight (prevents double submission). */
  inFlight?: boolean
  documentNumber?: string
  errorCode?: string
  errorMessage?: string
  /** Quantity SAP confirmed per product (schedule-line confirmation). */
  confirmedQty?: Record<ID, number>
  /** False when SAP created the order but could not confirm every quantity. */
  fullyConfirmed?: boolean
  /**
   * Idempotency key sent with every attempt (= TradeFlow request id). The integration layer
   * returns the existing SAP order for a key it has already processed instead of creating a second one.
   */
  idempotencyKey?: string
  /** SAP sold-to business partner used for the order (from the customer mapping). */
  soldTo?: string
  attempts: SapSubmissionAttempt[]
}

// ─── Finance ──────────────────────────────────────────────────────────────

export type InvoiceStatus =
  | 'Issued'
  | 'Receipt Uploaded'
  | 'Payment Verified'
  | 'Partially Paid'
  | 'Overdue'
  | 'Cancelled'

export interface ProformaInvoice {
  id: ID
  number: string
  requestId: ID
  customerId: ID
  issuedAt: ISODate
  dueAt: ISODate
  currency: CurrencyCode
  subtotal: number
  freight: number
  tax: number
  total: number
  status: InvoiceStatus
  bankDetails: { bank: string; accountName: string; iban: string; swift: string }
}

export type PaymentStatus =
  | 'Awaiting Receipt'
  | 'Receipt Uploaded'
  | 'Under Verification'
  | 'Verified'
  | 'Rejected'

export interface Payment {
  id: ID
  ref: string
  invoiceId: ID
  customerId: ID
  amount: number
  currency: CurrencyCode
  method: 'Bank Transfer' | 'Letter of Credit' | 'Cheque'
  valueDate?: ISODate
  payerBank?: string
  receiptFile?: { name: string; sizeKb: number; uploadedAt: ISODate }
  status: PaymentStatus
  verifiedById?: ID
  verifiedAt?: ISODate
  note?: string
}

// ─── Logistics ────────────────────────────────────────────────────────────

export const SHIPMENT_FLOW = [
  'Approved',
  'Awaiting Payment',
  'Payment Verified',
  'Ready for Warehouse Preparation',
  'Documents in Progress',
  'Ready for Collection',
  'Collected',
] as const

export type ShipmentStatus = (typeof SHIPMENT_FLOW)[number]

export interface PackingLine {
  productId: ID
  quantity: number
  cartons: number
  kind: 'Saleable' | 'Tester' | 'Sample'
}

export interface Shipment {
  id: ID
  ref: string
  requestId: ID
  customerId: ID
  status: ShipmentStatus
  mode: 'Customer Collection' | 'Sea Freight' | 'Air Freight'
  warehouse: string
  collectionRef?: string
  collectionWindow?: string
  cartons: number
  grossWeightKg: number
  volumeCbm: number
  packing: PackingLine[]
  history: { status: ShipmentStatus; at: ISODate; byId: ID; note?: string }[]
  documentIds: ID[]
}

// ─── Documents ────────────────────────────────────────────────────────────

export type DocumentType =
  | 'Commercial Registration'
  | 'Tax Certificate'
  | 'Trade License'
  | 'Bank Reference Letter'
  | 'Proforma Invoice'
  | 'Payment Receipt'
  | 'Packing List'
  | 'Commercial Invoice'
  | 'Certificate of Origin'
  | 'Bill of Lading'
  | 'Safety Data Sheet'

export interface DocumentRecord {
  id: ID
  name: string
  type: DocumentType
  linkedTo: { kind: 'customer' | 'request' | 'invoice' | 'shipment' | 'application'; id: ID }
  customerId?: ID
  uploadedAt: ISODate
  uploadedById: ID
  sizeKb: number
  status: 'Verified' | 'Pending Review' | 'Draft' | 'Expired' | 'Final'
  expiresAt?: ISODate
}

// ─── Communication ────────────────────────────────────────────────────────

export interface EmailParticipant {
  name: string
  email: string
}

export interface EmailMessage {
  id: ID
  from: EmailParticipant
  to: EmailParticipant[]
  sentAt: ISODate
  body: string
  attachments: { name: string; sizeKb: number; documentId?: string }[]
  direction: 'inbound' | 'outbound'
  /** True for messages composed inside the prototype (never actually sent). */
  simulated?: boolean
}

export type FollowUpStatus = 'None' | 'Open' | 'Due Today' | 'Overdue' | 'Done'

export interface EmailThread {
  id: ID
  subject: string
  customerId: ID
  requestId?: ID
  messages: EmailMessage[]
  followUp: { status: FollowUpStatus; dueAt?: ISODate; ownerId?: ID; note?: string }
  unread: boolean
  starred?: boolean
  labels: string[]
}

// ─── Notifications ────────────────────────────────────────────────────────

export interface AppNotification {
  id: ID
  title: string
  body: string
  at: ISODate
  read: boolean
  link?: string
  kind: 'approval' | 'finance' | 'logistics' | 'customer' | 'system' | 'email' | 'application'
  /** Roles that receive the notification. */
  audience: RoleId[]
  /** Specific recipients (e.g. the assigned approver or the applicant). */
  userIds?: ID[]
}

// ─── Configuration ────────────────────────────────────────────────────────

export interface PromoRules {
  enabled: boolean
  version: string
  /** One tester per N eligible fragrance units. */
  testerPerUnits: number
  /** Samples granted per block of eligible units. */
  samplesPerBlock: number
  sampleBlockUnits: number
  sampleSizeMl: number
  eligibleCategories: ProductCategory[]
}

export interface ApprovalRule {
  id: ID
  name: string
  /** Inclusive lower bound in USD. */
  minValueUsd: number
  /** Exclusive upper bound in USD; null = no upper bound. */
  maxValueUsd: number | null
  stages: ApprovalStageName[]
  slaHours: number
  active: boolean
}

export interface NotificationPreference {
  id: ID
  event: string
  description: string
  inApp: boolean
  email: boolean
  roles: RoleId[]
}

// ─── Integration monitor (simulated) ──────────────────────────────────────

export type IntegrationStatus = 'Synced' | 'Pending' | 'Failed' | 'Retrying'

export interface IntegrationEvent {
  id: ID
  entity: 'Business Partner' | 'Sales Order' | 'Pricing' | 'Billing Document' | 'Outbound Delivery' | 'Stock'
  direction: 'Outbound' | 'Inbound'
  objectRef: string
  targetRef?: string
  status: IntegrationStatus
  at: ISODate
  attempts: number
  message: string
  errorCode?: string
  payloadPreview: string
}

export interface IntegrationChannel {
  id: ID
  name: string
  status: 'Operational' | 'Degraded' | 'Down'
  lastSyncAt: ISODate
  latencyMs: number
  successRate: number
}
