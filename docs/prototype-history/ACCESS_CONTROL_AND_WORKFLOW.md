# Access control, customer onboarding workflow and public tracking

This document describes what the TradeFlow **frontend prototype** implements and what a backend must still provide. Everything below marked *prototype* runs in the browser against mock data in `localStorage`. **None of it is a security boundary.**

---

## 1. Frontend vs. backend at a glance

| Capability | Implemented in this frontend | Still requires backend work |
|---|---|---|
| Sign-in | Login form (validation, show/hide, generic error, 5-attempt lockout, session expiry 8 h, sign-out, return-to-page) against a **mock credential store** | Identity provider (OIDC/SAML), salted slow hashing (Argon2id/bcrypt), MFA, password reset, HttpOnly secure session cookies, server-side lockout and session revocation |
| Roles & permissions | Permission catalog, configurable roles, multi-role users, editable matrix, protected critical grants | `roles`, `permissions`, `role_permissions`, `user_roles` tables; admin APIs with their own authorization; change approval if required |
| Route & action gating | Menu, routes (typed URLs → 403 or sign-in), buttons and store actions all check the same permissions | **Every API endpoint must check permission + record scope server-side.** Browser checks only shape the UI |
| Record scope | Ownership, territory/region and review-region assignments, stage assignment | Same rules as query filters in the API/DB (row-level security), never trusting IDs from the client |
| Onboarding workflow | Configurable stages, pure transition engine, mandatory remarks, return routing, revisions, append-only history | Workflow service executing the same rules transactionally, with optimistic locking and idempotency |
| Public tracking | Ref + email or ref + token, generic errors, throttling, applicant-safe projection | Server endpoint returning only the projection, hashed single-purpose tokens, rate limiting per IP/reference, email delivery of links, logging |
| Notifications | In-app notifications targeted to users/roles; preference screen | Email/push delivery, templates, retries, unsubscribe, delivery logs |
| Audit trail | Consolidated, append-only *in the UI*, CSV export | Immutable server-side audit store (see §7) |
| Customer portal & management | Own-profile edit (validated), statement from proformas/payments, activities, territory moves with history, territory KPIs | Customer master updates via ERP/MDM with approval where required, statements and open items from the ERP, CRM-grade activity storage, reporting/warehouse for KPIs |
| Documents | Name/size/type, revision and supersession metadata | Object storage, malware scanning, access-controlled download URLs, retention |

---

## 2. Permission model

Catalog: `src/auth/permissions.ts` (id, module, action, label, description, critical flag). Ids follow `module.action[_scope]`, for example:

| Group | Examples |
|---|---|
| Workspace | `dashboard.view`, `task.view`, `notification.view` |
| Customer applications | `application.create`, `application.view_own`, `application.edit_own`, `application.resubmit`, `application.view_assigned`, `application.view_all`, `application.view_internal`, `application.review`, `application.approve`, `application.reject`, `application.return_to_requester`, `application.request_clarification`, `application.return_to_previous_approver` |
| Customers | `customer.view_own`, `customer.edit_own`, `customer.view_assigned`, `customer.view_all`, `customer.manage`, `customer.reassign` |
| Sales activities & performance | `activity.view_assigned`, `activity.view_all`, `activity.manage`, `performance.view_assigned`, `performance.view_all` |
| Sales orders | `order.view_own/assigned/all`, `order.create`, `order.create_on_behalf`, `order.approve`, `order.reject`, `order.return_to_requester`, `order.return_to_previous_approver`, … |
| Administration (critical ★) | `user.view★`, `user.manage★`, `role.view★`, `role.manage★`, `permission.manage★`, `workflow.manage`, `territory.manage`, `audit.view`, … |

**Effective permissions** = union of the permissions of the user's roles (`src/auth/authorize.ts → permissionsFor`). Inactive users have none.

**Record scope** is decided by permissions *plus* assignments — never by a role name:

| Record | Rule (prototype: `authorize.ts`, `store.tsx`, `useScope.ts`) |
|---|---|
| Customer application | owner with `view_own`; or `view_all`; or `view_territory` for applications from the user's assigned territories (read-only); or `view_assigned` **and** (currently assigned to the user, or the user acted/was addressed in its history, or it waits in a role queue of the user's role). Drafts are visible only to their owner. |
| Customer account & its orders/invoices/shipments | `view_all`; or `view_assigned` within the user's territories/region; or `view_own` for the user's linked account |
| Sales-order approval | pending step's role held by user + any order decision permission + (step approver, or territory/region assignment) |
| Visits & activities | `activity.view_all`; or `activity.view_assigned` for customers in the user's territories (and own entries) |
| Territory performance | `performance.view_all` (all territories, manager comparison); or `performance.view_assigned` (own territories only) |

### Default roles (configurable) — five primary demo accounts

| Requested role | Built-in role id | Demo account | Notes |
|---|---|---|---|
| Customer Portal User | `customer` (and `applicant` before approval) | Omar Haddad | Own account only: profile (`customer.edit_own` for contacts and delivery address), statement, orders, invoices, shipments, inquiries, own applications. A prospective customer registers as `applicant` and becomes `customer` on final approval. |
| Customer Onboarding Approver | `onboarding_approver` | Priya Nair | Registrations only: view, internal comments (`application.comment`), start review, return for information, request clarification, **approve (activates the customer account)**, reject. No `order.*` decision permission. |
| Sales Representative / Account Manager | `territory_sales_manager` | Daniel Okafor | Assigned territories only (`*.view_assigned`): customers, visits & follow-ups, sales history, performance; **first-level sales-request approval**, `order.sap_submit`; may create requests on behalf of territory customers. Registrations from his territories are **read-only** (`application.view_territory`, no decision permission). |
| Head of Sales | `head_of_sales` | Marcus Chen | All territories (`*.view_all`), manager monitoring, **second-level approval** of elevated/strategic requests, `order.sap_submit`, customer territory moves. Reads all registrations, decides none. **No** user/role/permission administration. |
| Operations (Finance & Fulfilment) | `operations_reviewer` | Priya Nair (second role) | Proforma, payment verification, shipments/collection, integration monitor and SAP retry (`order.sap_submit`). **No** approval permissions of any kind. |
| Administrator | `admin` | Elena Petrova | Users, roles, permissions, territory assignments, workflow configuration, audit trail. Read access to records but **no** sales or onboarding decisions. Critical permissions cannot be revoked from this role; the last active admin cannot be removed; users cannot deactivate themselves. |
| (optional, no seeded users) | `regional_manager`, `finance`, `logistics`, `auditor` | — | Kept for organisations that need a regional approval level, dedicated finance/logistics staff or an auditor. Approval rules and onboarding stages cannot be activated for a role that has no active users. |

Priya holds two roles on **one** user record (multi-role; effective permissions are the union) — onboarding permissions never imply sales-approval permissions.

Background records: four further Account Managers (one per remaining territory) exist as staff records so that territory restrictions are demonstrable, plus additional customers and prospective customers. They are records, not extra demo roles.

### Round 5 permissions (SAP-backed portal)

| Permission | Granted to | Allows |
|---|---|---|
| `delivery.view` | Customer, Sales Rep, Head of Sales, Operations, Admin, Auditor | SAP deliveries for accounts in scope |
| `delivery.confirm_receipt` | Customer | Acknowledge receipt / report discrepancies (own deliveries only, re-checked against SAP data) |
| `delivery.resolve_discrepancy` | Sales Rep, Operations | Close receipt discrepancies in scope |
| `finance.account_view` | Customer, Sales Rep, Head of Sales, Operations, Auditor | SAP invoices, open items, outstanding, aging, ledger, payments for accounts in scope |

Customers no longer hold `shipment.view` / `collection.view`; the TradeFlow warehouse-coordination screens are internal, and customers follow deliveries from SAP. SAP reads are filtered by the SAP business partner of the accounts in the user's scope (see `SAP_INTEGRATION.md`).

## 3. Data model (maps to the requested tables)

| Requested table | Prototype type / location |
|---|---|
| `users` | `DemoUser` (`src/types/domain.ts`), seed `src/data/org.ts` |
| `roles` | `Role`, seed `src/auth/roles.ts`, runtime `state.roles` |
| `permissions` | `PermissionDef`, `src/auth/permissions.ts` (static catalog) |
| `user_roles` | `DemoUser.roleIds` |
| `role_permissions` | `Role.permissions` |
| `user_assignments` | `DemoUser.territoryIds`, `regionId`, `reviewRegionIds`, `customerId`, `department` |
| `workflow_stages` | `WorkflowDef` / `WorkflowStageDef`, `src/workflow/onboarding.ts`, runtime `state.onboardingWorkflow` |
| `application_workflow_history` | `RegistrationApplication.history: WorkflowEvent[]` (append-only) |
| (supporting) | `ApplicationRevision` snapshots, `ApplicationDocument` with `revision` / `supersededInRevision`, `AdminAuditEntry`, `Session`, `DemoCredential` |

Suggested production schema additions: `applications(id, ref, status, current_stage_id, assigned_user_id, revision, owner_user_id, version)`, `application_revisions(application_id, revision, content_json, submitted_at)`, `application_documents(id, application_id, storage_key, type, revision, superseded_in_revision, sha256)`, `tracking_tokens(application_id, token_hash, expires_at, revoked_at)`, `audit_log(...)` (see §7).

---

## 4. Workflow

### Statuses

`Draft → Submitted → Under Review → Approved` (plus `Pending Approval` only when optional extra stages are active) with side paths `Returned for Information → Resubmitted`, and terminal `Rejected`.

### Default stages (`src/workflow/onboarding.ts`, editable in **Workflow Rules › Customer onboarding**)

| # | Stage | Type | Role | Assignment | SLA |
|---|---|---|---|---|---|
| 1 | Onboarding review & approval | approval | Customer Onboarding Approver | by review region | 48 h |
| – | Credit & compliance check (optional) | approval | Finance Officer (optional) | role queue | inactive |
| – | Commercial approval (optional) | approval | Account Manager | manager of the applicant's territory | inactive |
| – | Final approval (optional) | approval | Head of Sales | role queue | inactive |

The default is **one** decision stage (requirements §2 Workflow A). Optional stages stay configurable; if activated, their role must have the decision permissions and active members.

Policies: resubmission goes to the *returning stage and reviewer* (or the first stage); returns to *any* earlier stage (or only the immediately previous one). Saving is refused if an active stage's role lacks the needed permission or has no active members, or if a stage with in-flight applications would be deactivated.

### Transitions (`src/workflow/engine.ts`)

| Action | Who | Required input | Result |
|---|---|---|---|
| Start review | stage owner, `review`/`approve` | – | Submitted/Resubmitted → Under Review / Pending Approval; assigned to actor |
| Approve | stage owner, `application.approve` | optional internal + public remarks | next active stage, or **Approved** at the last active stage → customer account created **once** (refused if the application already has an account or the registration number belongs to an existing customer), applicant role → Customer Portal User, audit entry with approver and date |
| Internal comment | `application.comment` + record visibility | text | internal-only history event; no status change; never in the public projection |
| Reject | `application.reject` | **public reason ≥ 10 chars** | Rejected (terminal, distinct from a return) |
| Return to requester | `application.return_to_requester` | **instructions ≥ 10 chars + ≥ 1 section** | Returned for Information; only selected sections editable |
| Request clarification | `application.request_clarification` | **question ≥ 10 chars** | Returned for Information (no fields re-opened) |
| Return to previous approver | `application.return_to_previous_approver` | **internal findings ≥ 10 chars**, target stage | moves to that stage, assigned to the approver who last approved there (if still active) else the stage's assignee; internal event + public "assigned" event |
| Resubmit / answer | owner, `application.resubmit` | correction: changed content; clarification: answer | Resubmitted; correction increments the revision and snapshots content; routed per policy |

The same `availableActions` function renders the buttons **and** re-validates inside `applyReviewerAction` before any state change. Every transition appends `WorkflowEvent`s (actor, time, from/to status and stage, recipient, public and internal remarks, visibility, revision). Events are never edited or removed; superseded documents are kept.

Duplicate registrations: submission is refused when the normalised commercial registration number matches an existing customer or another open application.

### Workflow B — sales requests and SAP

Request statuses: `Draft → Pending Approval (Under Review at an escalated level) → Approved`, side path `Returned for Clarification → resubmit`, terminal `Rejected` / `Cancelled`; afterwards `Awaiting Payment → Payment Verified → In Fulfillment → Ready for Collection → Collected`.

Approval bands (default): below USD 25k → Account Manager; USD 25k and above → Account Manager → Head of Sales. Return to previous approver keeps earlier decisions in `ApprovalStep.history`; reject and return need a reason.

**SAP submission is a separate record** (`SalesOrderRequest.sap`): final approval sets `Pending SAP Creation` and creates no SAP document. `submitToSap` (permission `order.sap_submit` **and** the customer in the user's scope, re-checked in the store) locks the record, calls `services.sap.submitSalesOrder`, and records each attempt (time, user, outcome, mode, document number or error). Outcomes: `Sales Order Created`, `Submitted to SAP` (document created, partial confirmation), `SAP Creation Failed` (retry allowed). Shipment and proforma require an SAP document number. The only implementation is the **development mock** (`mode: 'mock'`, `MOCK-SO-` numbers, labelled in every SAP panel); no SAP endpoint or credential exists in the frontend.

---

## 5. Public tracking (no sign-in)

`/track` accepts **reference + registered email**, or a **secure link** `/track?ref=…&token=…` (random 192-bit token, 30-day expiry, revocable/regenerable by the applicant). The reference alone shows nothing.

The response is the **applicant-safe projection** `toPublicView()` (`src/workflow/publicView.ts`): status, headline, current stage label and number, submission/last-update dates, required action and editable sections, public remarks, decision message, and a timeline of *public* events that actually happened. It never contains internal remarks, staff names, assignment details, other applications or document contents. Errors are identical for unknown reference, wrong email and wrong token; five failures trigger a 60-second cool-down (per browser session in the prototype).

**Backend required:** a dedicated endpoint (e.g. `POST /public/applications/track`) that performs the lookup server-side, compares email case-insensitively against verified addresses, stores only **hashes** of tracking tokens, rate-limits per IP and per reference with exponential back-off/CAPTCHA, logs every attempt, returns only the projection, sets `Cache-Control: no-store`, and emails the link instead of exposing it only on screen. Consider email one-time codes instead of long-lived links.

---

## 6. Notifications

Generated on: submitted, assigned / moved to next stage, approved (incl. final), rejected, returned to requester, clarification requested, returned to previous approver, resubmitted / clarification answered, account created. Each is addressed to specific users (assignee, applicant, previous approver, the customer's own users) or, for role queues, to the role. Preferences per event are listed in **Workflow Rules › Notification preferences**.

**Backend required:** a notification service (outbox pattern from the workflow transaction), email templates, delivery retries and logs, user-level preferences, and suppression for inactive users.

---

## 7. Audit trail and immutable logging

The prototype shows a consolidated audit trail (application workflow history, sales-order activity, user/role/permission/workflow/territory changes, sign-in success/failure) with filters and CSV export. It has no edit/delete path, but browser storage is **not** tamper-proof.

Production requirements:

1. Write audit records server-side in the **same transaction** as the change (or via a transactional outbox).
2. Append-only store: no UPDATE/DELETE grants for the application user; WORM/object-lock storage or hash-chaining (`hash = sha256(prev_hash + record)`) with periodic anchoring.
3. Server-assigned timestamps from a trusted clock; actor taken from the authenticated session, never from the request body.
4. Record before/after values for configuration and permission changes; include request id, IP and user agent for security events.
5. Retention policy and restricted read access (`audit.view`), with exports themselves audited.

---

## 8. Server-side validation required in production

- Authenticate every request; derive the actor from the session.
- For every endpoint: check the permission **and** the record scope (ownership/assignment/territory) in the query, not after loading.
- Re-run the workflow rules (`availableActions` equivalent) inside a transaction with optimistic concurrency (`version` column) so two approvers cannot act on the same stage; make transitions idempotent.
- Validate all inputs (mandatory remarks, allowed sections, field formats) with the same schema as the UI.
- Enforce that applicants can change only the sections re-opened for correction; keep previous revisions immutable.
- Prevent privilege escalation: only `permission.manage` may change grants; protect critical grants and the last administrator; consider four-eyes approval for role changes.
- Never return internal remarks or other users' data to external users; use separate DTOs for public, applicant and reviewer views.
- Document uploads: type/size limits, malware scanning, storage outside the web root, short-lived signed download URLs.

---

## 9. Decisions taken where requirements conflicted (least-disruptive choices)

| Topic | Decision |
|---|---|
| "Distributor" → "Customer" | All user-facing text now uses *Customer* (Customer Portal, Customer Registration, Customer Profile, Customer Management, Customer Applications, Territory Management), including permission ids (`customer.*`) and URLs (`/app/customers`; old `/app/distributors` links redirect). Kept on purpose: the business type "Wholesale distributor", the company name "Ceylon Luxe Distributors", and the SAP object name "customer master / Business Partner". |
| Five demo accounts vs. four required roles (round 4) | Customer Onboarding Approver added as its own role; Priya holds it plus Operations (one user, two roles — no duplicate account). The Territory Sales Manager role is now *Sales Representative / Account Manager* and lost onboarding decisions; Head of Sales lost onboarding decisions and keeps the second sales-approval level. Onboarding collapsed to one active stage; the former commercial/final stages remain optional. |
| Other territory managers | Four additional Account Manager records remain (not promoted as demo accounts) because each territory needs a manager for routing and to demonstrate that a TSM cannot see other territories. |
| Optional roles | Regional Manager, Finance, Logistics and Auditor roles are kept (no users) instead of deleted, so organisations can re-enable them without code changes. |
| Territory moves | Moving a customer changes its current territory and records assignment history; existing orders keep the territory recorded on them (for reporting) while visibility follows the customer's current territory. Requests already in approval stay with their original approver. |
| Status names | Request statuses renamed to the requested vocabulary (`In Approval` → `Pending Approval`, `Changes Requested` → `Returned for Clarification`; application `Returned for Correction` → `Returned for Information`). `Under Review` for requests is derived (pending at an escalated level). Stored state version bumped to 6, so older browser data is reset to the new seed. |
| Administrator decisions | Admin can see but not decide applications or orders (segregation of duties); grantable if desired. |
| Demo role switcher | Not reintroduced: sign-in with the five labelled demo accounts serves the same purpose without bypassing authentication. |
| `/status/:ref` public page | Replaced by `/track` because a reference alone must not reveal data; the old URL redirects to the verification form. |

## 10. Tests

- `npm test` — 21 Vitest tests: workflow engine (stage ownership, onboarding vs. sales permission separation, start-before-decide, mandatory remarks, reject by the onboarding approver with internal remarks kept out of the public view, single-stage final approval, resubmit routing, optional stage activation), record-level visibility, customer scope, tracking service; SAP development mock (mock mode and `MOCK-SO-` numbers, partial confirmation above stock, timeout then successful retry, empty payload rejected) and seeded approval/SAP state consistency.
- `tests/e2e/scenarios.py` — 28 Playwright scenarios grouped A–H per requirements §15 (registration, approval, rejection, catalogue, request creation, approval + SAP submission/failure/retry, role permissions, existing functionality), and `tests/e2e/smoke.py` (all demo accounts × all permitted pages, no console errors).
