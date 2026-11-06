/**
 * Built-in roles and their default permission sets (conceptually `roles` + `role_permissions`).
 * Administrators can edit these grants and add custom roles at runtime in the prototype.
 *
 * Core roles (requirements §10):
 *   Customer Portal User                  → customer   (and `applicant` before approval)
 *   Customer Onboarding Approver          → onboarding_approver (registrations only — no sales approvals)
 *   Sales Representative / Account Manager → territory_sales_manager (sales-request approval; no onboarding approval)
 *   Administrator                         → admin
 * Supporting roles used by the demo:
 *   Head of Sales                         → head_of_sales (second approval level for elevated/strategic requests)
 *   Operations (Finance & Fulfilment)     → operations_reviewer (proforma, payment verification, shipments)
 * Optional roles (no seeded users) remain available for organisations that need them:
 *   regional_manager, finance, logistics, auditor.
 */
import type { Role } from '@/types/domain'
import { PERMISSIONS } from './permissions'

export const ROLE_IDS = {
  admin: 'admin',
  customer: 'customer',
  applicant: 'applicant',
  onboardingApprover: 'onboarding_approver',
  territorySalesManager: 'territory_sales_manager',
  headOfSales: 'head_of_sales',
  operationsReviewer: 'operations_reviewer',
  regionalManager: 'regional_manager',
  finance: 'finance',
  logistics: 'logistics',
  auditor: 'auditor',
} as const

/** Role whose critical administration permissions are locked (prevents lock-out). */
export const PROTECTED_ROLE_ID = ROLE_IDS.admin

const WORKSPACE = ['dashboard.view', 'task.view', 'notification.view']
const APP_DECIDE = ['application.approve', 'application.reject', 'application.return_to_requester', 'application.request_clarification', 'application.return_to_previous_approver']
const ORDER_DECIDE = ['order.approve', 'order.reject', 'order.return_to_requester', 'order.return_to_previous_approver']

export const defaultRoles: Role[] = [
  {
    id: ROLE_IDS.admin,
    name: 'Administrator',
    description: 'Manages users, roles, permissions, territories and assignments, workflow configuration and integrations. No sales or onboarding decisions by default.',
    system: true,
    audience: 'internal',
    permissions: [
      ...WORKSPACE,
      'application.view_all', 'application.view_internal',
      'customer.view_all', 'customer.manage', 'customer.reassign',
      'catalog.view', 'catalog.manage', 'order.view_all', 'order.approval_monitor', 'delivery.view',
      'invoice.view', 'payment.view', 'shipment.view', 'collection.view', 'document.view',
      'email.view', 'activity.view_all', 'performance.view_all',
      'user.view', 'user.manage', 'role.view', 'role.manage', 'permission.manage',
      'territory.view', 'territory.manage', 'workflow.view', 'workflow.manage', 'integration.view', 'integration.retry', 'audit.view',
    ],
  },
  {
    id: ROLE_IDS.customer,
    name: 'Customer Portal User',
    description: 'Existing customer: own profile, statement, orders, invoices, shipments, inquiries and own applications.',
    system: true,
    audience: 'external',
    permissions: [
      ...WORKSPACE, 'application.view_own', 'customer.view_own', 'customer.edit_own', 'catalog.view',
      'order.view_own', 'order.create', 'order.cancel', 'order.comment',
      'delivery.view', 'delivery.confirm_receipt', 'finance.account_view',
      'invoice.view', 'payment.view', 'payment.upload_receipt', 'document.view', 'document.upload',
      'email.view', 'email.send',
    ],
  },
  {
    id: ROLE_IDS.applicant,
    name: 'Prospective Customer (Applicant)',
    description: 'Registered prospect: submits and tracks its own customer application and responds to corrections. Becomes a Customer Portal User when approved.',
    system: true,
    audience: 'external',
    permissions: ['dashboard.view', 'notification.view', 'task.view', 'application.create', 'application.view_own', 'application.edit_own', 'application.resubmit'],
  },
  {
    id: ROLE_IDS.onboardingApprover,
    name: 'Customer Onboarding Approver',
    description: 'Reviews customer registrations: checks business information and documents, records findings, returns for information, approves (activates the customer account) or rejects. Cannot approve sales requests.',
    system: true,
    audience: 'internal',
    permissions: [
      ...WORKSPACE,
      'application.view_assigned', 'application.view_all', 'application.view_internal', 'application.comment',
      'application.approve', 'application.reject', 'application.return_to_requester', 'application.request_clarification',
      'customer.view_all',
    ],
  },
  {
    id: ROLE_IDS.territorySalesManager,
    name: 'Sales Representative / Account Manager',
    description: 'Assigned territories only: reviews and approves customer sales requests (first level), initiates SAP submission, manages customers, visits and territory performance. No customer-onboarding approval.',
    system: true,
    audience: 'internal',
    permissions: [
      ...WORKSPACE,
      'application.view_territory',
      'customer.view_assigned', 'catalog.view',
      'order.view_assigned', 'order.create_on_behalf', 'order.cancel', 'order.comment', 'order.sap_submit', ...ORDER_DECIDE,
      'delivery.view', 'delivery.resolve_discrepancy', 'finance.account_view',
      'invoice.view', 'payment.view', 'shipment.view', 'document.view',
      'email.view', 'email.send', 'followup.manage',
      'activity.view_assigned', 'activity.manage', 'performance.view_assigned',
    ],
  },
  {
    id: ROLE_IDS.headOfSales,
    name: 'Head of Sales',
    description: 'All territories: consolidated performance, manager monitoring, second-level approval of elevated and strategic sales requests, SAP submission. No onboarding approval and no system administration.',
    system: true,
    audience: 'internal',
    permissions: [
      ...WORKSPACE,
      'application.view_all',
      'customer.view_all', 'customer.manage', 'customer.reassign', 'catalog.view',
      'order.view_all', 'order.comment', 'order.approval_monitor', 'order.sap_submit', ...ORDER_DECIDE,
      'delivery.view', 'finance.account_view',
      'invoice.view', 'payment.view', 'shipment.view', 'document.view', 'email.view', 'email.send', 'followup.manage',
      'activity.view_all', 'activity.manage', 'performance.view_all', 'territory.view',
    ],
  },
  {
    id: ROLE_IDS.operationsReviewer,
    name: 'Operations (Finance & Fulfilment)',
    description: 'Runs order operations after SAP submission: proforma invoices, payment verification, shipments and collection; monitors SAP integration. No approval rights.',
    system: true,
    audience: 'internal',
    permissions: [
      ...WORKSPACE,
      'customer.view_all', 'catalog.view',
      'order.view_all', 'order.comment', 'order.approval_monitor',
      'delivery.view', 'delivery.resolve_discrepancy', 'finance.account_view',
      'invoice.view', 'invoice.issue', 'payment.view', 'payment.verify',
      'shipment.view', 'shipment.update', 'collection.view', 'document.view', 'document.upload',
      'email.view', 'email.send', 'followup.manage', 'integration.view', 'integration.retry', 'order.sap_submit',
    ],
  },
  // ── Optional roles (no seeded users) ──
  {
    id: ROLE_IDS.regionalManager,
    name: 'Regional Manager (optional)',
    description: 'Optional middle approval level for orders in a region. Not used by the default approval bands.',
    system: true,
    audience: 'internal',
    permissions: [...WORKSPACE, 'customer.view_assigned', 'catalog.view', 'order.view_assigned', 'order.comment', ...ORDER_DECIDE, 'invoice.view', 'shipment.view', 'activity.view_assigned', 'performance.view_assigned'],
  },
  {
    id: ROLE_IDS.finance,
    name: 'Finance Officer (optional)',
    description: 'Optional dedicated finance role: proformas, payments and the optional credit-check onboarding stage.',
    system: true,
    audience: 'internal',
    permissions: [
      ...WORKSPACE, 'customer.view_all', 'order.view_all', 'order.comment', 'invoice.view', 'invoice.issue', 'payment.view', 'payment.verify',
      'application.view_assigned', 'application.view_internal', ...APP_DECIDE, 'integration.view', 'integration.retry',
    ],
  },
  {
    id: ROLE_IDS.logistics,
    name: 'Logistics Coordinator (optional)',
    description: 'Optional dedicated warehouse / shipping role.',
    system: true,
    audience: 'internal',
    permissions: [...WORKSPACE, 'order.view_all', 'order.comment', 'shipment.view', 'shipment.update', 'collection.view', 'document.view', 'document.upload'],
  },
  {
    id: ROLE_IDS.auditor,
    name: 'Read-only Auditor (optional)',
    description: 'Views records, decisions and audit history. Cannot modify records or take workflow actions.',
    system: true,
    audience: 'internal',
    permissions: [
      'dashboard.view', 'notification.view',
      'application.view_all', 'application.view_internal', 'customer.view_all', 'order.view_all', 'order.approval_monitor', 'delivery.view', 'finance.account_view',
      'invoice.view', 'payment.view', 'shipment.view', 'document.view', 'email.view', 'activity.view_all', 'performance.view_all',
      'user.view', 'role.view', 'workflow.view', 'territory.view', 'audit.view',
    ],
  },
]

// Sanity check during development: every granted permission must exist in the catalog.
if (import.meta.env.DEV) {
  const known = new Set(PERMISSIONS.map((x) => x.id))
  for (const r of defaultRoles) for (const perm of r.permissions) if (!known.has(perm)) console.warn(`Unknown permission ${perm} on role ${r.id}`)
}
