# Round 4 — Enhancement & UI/UX modernization (change report)

Baseline: `TradeFlow_Frontend_V.03` (the existing application was enhanced in place — no rebuild, no new dependencies).

## 1. What changed, by requirement

| § | Change | Main files |
|---|---|---|
| 2 | Two separate workflows. Onboarding (Workflow A) and sales requests (Workflow B) use separate permissions; approving a customer never touches a request. | `src/auth/roles.ts`, `src/auth/permissions.ts`, `src/workflow/onboarding.ts` |
| 3 | Registration form kept as-is (existing tabs/fields, multi-step, required markers, inline validation, save draft, review step, reference + confirmation). Status *Returned for Correction* renamed **Returned for Information**. Duplicate registration numbers are refused. | `src/app/store.tsx`, `src/types/domain.ts` |
| 4 | Onboarding dashboard: KPI filters (Total, Pending review, Under review, Returned, Approved, Rejected); columns Ref, Company, Contact person, Business email, Submission date, Status, Assigned reviewer, Actions; search, filters, sorting, pagination. Review screen: **internal comments**, return for information, approve (confirmation: *Approve and activate account*), reject with reason. Activation creates the account once, assigns the Customer Portal User role and writes an audit entry (approver + date). | `src/pages/applications/ApplicationsQueuePage.tsx`, `ApplicationDetailPage.tsx`, `src/workflow/engine.ts`, `src/app/store.tsx` |
| 5 | Compact customer dashboard: request KPIs (My requests, Pending, Needs your input, Approved, Rejected, Awaiting payment), recent requests, company card, catalogue & stock snapshot, *Create request* action. The old closed-application block and the illustrative revenue chart with an invented growth figure were removed. | `src/pages/dashboard/OverviewPage.tsx` |
| 6 | Catalogue: `ProductImage` (fixed aspect ratio, uses `imageUrl` when present, labelled *Illustration* / *Image unavailable* fallback), description, UoM / stock UoM, price per UoM, availability, **over-stock warning**, stock-source label *demo data — not live SAP*. Users without request permissions get a read-only catalogue (no cart). | `src/components/data-display/ProductImage.tsx`, `StockSourceNote.tsx`, `src/pages/catalog/CatalogPage.tsx`, `src/data/catalog.ts` |
| 7 | Request wizard: images, category filter, description, UoM, over-stock warning (no longer a blocking error), subtotal / taxes (*not calculated*) / estimated total, honest confirmation (*saved in this browser only; backend `SalesOrderService.submitRequest` required*), status **Pending Approval**. | `src/pages/orders/RequestWizardPage.tsx` |
| 8 | *Request approvals* (was Approval workbench): KPI filters (Total, Pending approval, Under review, Approved, Rejected, Submitted to SAP), columns ref, customer, date, products, total, status, assigned rep, actions; tabs incl. **Awaiting SAP submission**. Request detail lines show image, code, quantity + UoM, unit price, available stock, line total and SAP-confirmed qty. | `src/pages/approvals/ApprovalWorkbenchPage.tsx`, `src/pages/orders/RequestDetailPage.tsx`, `src/utils/requestStatus.ts`, `src/components/data-display/KpiStrip.tsx` |
| 9 | **SAP separated from approval.** New `SapOrderService` contract + development mock; `SalesOrderRequest.sap` record (status, attempts, document number, confirmations, error); `submitToSap` with permission + scope check and in-flight lock; retry; invoice/shipment only after an SAP document exists; SAP panel; integration-monitor events; SAP-queue banner on dashboards. Statuses: Pending SAP Submission, Submitted to SAP, SAP Submission Failed, SAP Confirmed. | `src/services/contracts.ts`, `src/services/mock.ts`, `src/services/index.ts`, `src/components/orders/SapSubmissionPanel.tsx`, `src/app/store.tsx`, `src/data/transactions.ts`, `src/data/integration.ts` |
| 10 | Roles: Customer Portal User · **Customer Onboarding Approver** (new) · **Sales Representative / Account Manager** (renamed; onboarding decisions removed) · Administrator; supporting Head of Sales (second approval level) and Operations (finance & fulfilment, no approvals). Priya = two roles on one account. New permissions `application.comment`, `order.sap_submit`. | `src/auth/*`, `src/data/org.ts` |
| 11 | Compact enterprise theme: navy shell, single blue accent, 8 px radius, minimal shadow, 48 px top bar, narrower sidebar, smaller page headers, compact cards, tables, tabs, buttons and KPI strips; no decorative buttons (KPIs are real filters or plain figures). Mobile width checked for overflow. | `src/styles/index.css`, `src/components/layout/*`, `src/components/ui/*`, `StatCard.tsx`, `DataTable.tsx`, spacing across pages |
| 12–13 | Distinct states for submitted / approved / SAP-submitted / SAP-confirmed; available / requested / SAP-confirmed quantity; customers see plain-language SAP status only (no error codes). Errors handled: duplicate registration, over-stock, failed images, unauthorised actions (store re-checks), SAP failure + retry. | as above |
| 15 | Tests rewritten / extended. | `src/workflow/engine.test.ts`, `src/services/sap.test.ts`, `tests/e2e/scenarios.py` |

Renames: request statuses *In Approval* → **Pending Approval**, *Changes Requested* → **Returned for Clarification**; approval stage *Territory Sales Manager* → **Account Manager**; navigation *Customer Applications* → **Customer Onboarding**, *Sales Order Requests* → **Sales Requests**, *Approval Workbench* → **Request Approvals** (moved under Sales). Stored-state version bumped to 6 (old browser data resets to the new seed).

## 2. What was tested (actually run)

- `npm run build` (TypeScript strict + Vite) — passes. `npm run lint` (oxlint) — no errors (pre-existing warnings only).
- `npm test` — **21/21** Vitest tests pass.
- `python3 tests/e2e/scenarios.py` against `vite preview` — **28/28** pass, 0 console errors:
  - A registration → review → internal comment → return for information → resubmit → clarification → approve → account + role + audit; duplicate registration refused
  - B rejection with mandatory reason, shown publicly
  - C catalogue: fallback image label, failed image URL fallback, price/stock UoM, stock-source label, over-stock warning
  - D customer creates a request → reference → Pending Approval; no approve button / SAP panel for the customer
  - E sales rep approves → *Approved · Pending SAP Submission*, invoice blocked → submit to SAP → *SAP Confirmed* `MOCK-SO-…` → invoice allowed → customer sees plain status; mandatory rejection reason; failed SAP submission (SOR-2026-0127) → retry → confirmed, visible in Integration Monitor
  - F first level has no previous approver; Head of Sales returns to Account Manager
  - G onboarding approver cannot approve sales requests; sales rep and Head of Sales cannot decide registrations; customer gets 403 on typed URLs and cannot open another customer's request
  - H existing functionality: customer profile/statement/history, visits, territory performance, territory moves, Head of Sales vs admin, login validation/lockout/return path, 403s, admin multi-role user + matrix + workflow validation + audit
- `python3 tests/e2e/smoke.py` — every demo account × every permitted page, 0 errors.
- Manual visual checks (screenshots) of customer, onboarding, sales-rep, approval and request-detail pages at 1440 px; overflow check at 390 px on 12 pages.

Not tested: real SAP, real image URLs from a DAM, server persistence, multi-user concurrency, screen-reader walkthrough (semantic roles/labels are in place but no assistive-technology session was run).

## 3. Incomplete backend / SAP dependencies

| Area | What is missing | Frontend seam |
|---|---|---|
| Persistence | All data lives in the browser (`localStorage`). Requests, registrations, comments and audit are **not** saved on a server. | `src/services/contracts.ts` (`SalesOrderService.submitRequest`, etc.) |
| SAP sales order | No SAP connection. A BFF must implement `SapOrderService.submitSalesOrder` server-side (credentials, API choice, idempotency key = request id, persistence of document number / confirmations / errors, async status if SAP responds later). | `SapOrderService` in `contracts.ts`; swap in `src/services/index.ts` (`SAP_MODE` then reports `live`) |
| SAP stock & prices | Seeded demo values. Needs ATP/stock per plant and customer pricing conditions with an *as-of* timestamp. | `CatalogService.getPriceAndAvailability` (`source` field) |
| Product images | No image source exists. Needs product master / DAM URLs populated into `Product.imageUrl`. | `ProductImage` |
| Taxes | Not calculated. Needs tax determination (SAP pricing or tax engine). | wizard summary |
| Business partner | Customer activation creates a local record only; BP creation in S/4HANA needed. | `activateCustomer` → integration event |
| Identity & authorization | Simulated sign-in; all permission checks must be repeated server-side (see `ACCESS_CONTROL_AND_WORKFLOW.md` §8). | `src/auth` |
| Notifications / email | In-app only; no delivery. | notification drafts in the store |
| Document storage | File names/sizes only. | `FileDrop`, documents |
