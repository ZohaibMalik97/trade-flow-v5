# Round 5 — End-to-end SAP-integrated customer portal (change report)

Baseline: V.04 (round 4) — enhanced in place; registration process, onboarding approval, authentication,
routing, user management and existing modules preserved. No new dependencies.

**Important:** there is no SAP system or backend in this project. Every SAP-backed screen is fully built
against a typed contract and runs on a **development stand-in** that is labelled everywhere
("Source: SAP development mock — not connected to SAP", `MOCK-` document numbers). See
`docs/SAP_INTEGRATION.md` for the architecture, mappings, status model and the backend work list.

## 1. What changed

| Area | Change | Files |
|---|---|---|
| Registration (§2) | Unchanged: same form, tabs, fields, validation, single-stage onboarding approval and activation. | — |
| SAP data contract (§12) | `SapCustomerDataService` (orders, deliveries, invoices, invoice PDF, payments, ledger, outstanding, aging, summary) + richer `SapSalesOrderPayload` (idempotency key, sold-to BP, ship-to, terms, remarks, material numbers). | `src/services/contracts.ts`, `src/types/sap.ts` |
| Development SAP stand-in | Seeded SAP documents (orders incl. ones entered directly in SAP, multiple/partial deliveries, invoices, a credit memo, a cancelled and re-billed invoice, partial and unallocated payments); open-item, ledger, outstanding and aging derivations that reconcile; customer isolation by BP; idempotent order creation; outage and timeout modes; simulator API. | `src/services/sapDevMock.ts`, `src/services/mock.ts` |
| Mappings | `Customer.sapBusinessPartner` (maintainable on the customer page, audited; Nordlicht deliberately unmapped), `Product.sapMaterial`. | `src/types/domain.ts`, `src/data/customers.ts`, `src/data/catalog.ts`, `src/pages/customers/CustomerDetailPage.tsx` |
| Stage 2–3 (§3) | Approval then automatically requests the SAP order; statuses renamed to Pending SAP Creation / SAP Creation Failed / Sales Order Created; retry is idempotent (existing order returned, no duplicate); customer sees request no., approval, SAP order no., SAP order status, creation date and approved value; internal-only request comments. | `src/app/store.tsx`, `src/pages/orders/RequestDetailPage.tsx`, `src/components/orders/SapSubmissionPanel.tsx` |
| Sales orders (§4) | New Sales Orders list (replaces the old Orders page): request ref, SAP order, date, combined status, value, delivery and invoice status, KPI filters, search, sorting, pagination. Order detail with a 7-step lifecycle timeline, items (ordered/confirmed/delivered/billed), deliveries, invoices. | `src/pages/sap/SalesOrdersPage.tsx`, `SalesOrderDetailPage.tsx`, `src/utils/orderLifecycle.ts` |
| Deliveries & goods receipt (§5) | Deliveries list/detail from SAP (delivered and pending qty, multiple per order); **Confirm goods received** with receipt date, remarks, per-line received/damaged qty and notes, review dialog, `GRC-` reference; discrepancies routed to Operations + account manager and resolved by them; explicitly *not* an SAP goods receipt. | `src/pages/sap/DeliveriesPage.tsx`, `DeliveryDetailPage.tsx`, `src/data/receipts.ts`, store actions `confirmGoodsReceipt`, `resolveReceiptDiscrepancy` |
| Invoices (§6) | SAP invoices and open invoices (filters: status, invoice date, due date, overdue), invoice detail with lines, tax, totals, payments/credits applied, outstanding; official PDF only if SAP provides one (stand-in says it is unavailable — no fake document). | `src/pages/sap/InvoiceList.tsx`, `SapInvoicesPage.tsx`, `OpenInvoicesPage.tsx`, `SapInvoiceDetailPage.tsx` |
| Financial reports (§7) | Outstanding report (current vs overdue, unallocated payments, net balance, reporting date); invoice aging with 5 buckets, bucket filter and documented basis; customer ledger with opening/running/closing balance, date range and server-side paging; staff choose an account in their scope. | `src/pages/sap/OutstandingPage.tsx`, `AgingPage.tsx`, `LedgerPage.tsx`, `AccountReport.tsx` |
| Payments (§8) | Posted SAP payments with allocations and unallocated amounts; payment detail. Existing proof-of-payment upload kept as **Payment advice** (pending verification, never marks SAP invoices paid). | `src/pages/sap/SapPaymentsPage.tsx`, `SapPaymentDetailPage.tsx`, `src/pages/finance/PaymentsPage.tsx` |
| Navigation (§9) | Workspace · Products · Sales (Create Sales Request, Sales Requests, Request Approvals, Sales Orders) · Deliveries · Finance (Invoices, Open Invoices, Outstanding Report, Invoice Aging, Customer Ledger, Payments, Payment Advice, Proforma Requests) · My Account (Business Profile, My Applications, Documents). Permission-driven; new permissions `delivery.view`, `delivery.confirm_receipt`, `delivery.resolve_discrepancy`, `finance.account_view`. | `src/config/navigation.ts`, `src/app/router.tsx`, `src/auth/*` |
| Customer dashboard (§10) | Sales / Deliveries / Finance overview panels (every figure links to its list), recent activity tabs (requests, orders, deliveries, invoices, payments) with guided empty states, account card, catalogue & stock. No fabricated values. | `src/pages/dashboard/CustomerDashboard.tsx` |
| Existing modules aligned | Business profile statement now reads the SAP ledger (no balances from TradeFlow history). Proforma invoices relabelled **Proforma requests** (not tax invoices); TradeFlow shipments relabelled **Warehouse coordination** (internal); customers use SAP Deliveries instead. Integration Monitor: SAP development simulator; sales-order failures retried only from the request. | `CustomerAccountPage.tsx`, `InvoicesPage.tsx`, `ShipmentsPage.tsx`, `IntegrationMonitorPage.tsx`, `src/components/sap/*` |
| Shared | `useSapQuery` (loading/error/reload), access context from the user's scope, source/sync bar, outage / not-mapped / not-found states, account picker, status badge tones. | `src/hooks/useSap.ts`, `src/components/sap/SapParts.tsx`, `src/components/ui/Badge.tsx` |

Removed: `src/pages/orders/OrdersPage.tsx` (replaced by the Sales Orders page on the same route `/app/orders`).
Stored state version bumped to 7 (old browser data resets once).

## 2. Tests actually run

- `npm run build` (TypeScript strict + Vite) passes. `npm run lint` (oxlint) passes with 0 errors (pre-existing warnings only).
- `npm test`: **26/26** Vitest tests pass. The SAP tests cover:
  - idempotent creation and timeout-after-commit;
  - unmapped business partner;
  - partial confirmation;
  - customer isolation;
  - ledger = open items − unallocated payments, with aging total = outstanding;
  - ledger window opening balance;
  - payment clearing;
  - cancelled invoices;
  - multi-delivery order status.
- `tests/e2e/scenarios.py` (Playwright against `vite preview`): **37/37** pass, 0 console errors. Mapping to spec §16:

| Spec test | Scenarios |
|---|---|
| 1 Registration | A1–A9, B1 |
| 2 Sales request | C1, D1 |
| 3 Sales approval | T3/T4, E2, F1, F2, G1 |
| 4 SAP sales order | T3/T4 (development stand-in, not real SAP) |
| 5 Integration failure | T5a, T5b (no duplicate on retry) |
| 6 Delivery visibility | T6 (partial + second delivery) |
| 7 Goods receipt | T7 (shortage → routed → resolved; full receipt; no double confirmation) |
| 8 Invoice visibility | T8 |
| 9 Outstanding & aging | T9 |
| 10 Ledger | T10 (closing balance = outstanding net balance) |
| 11 Payments | T11 |
| 12 Security | T12, G1, H7 |
| 13 Existing functionality | H1–H8, A1–A9, G2, G3 |
| 14 UI/UX | T14 (no horizontal scroll at 390 px on 9 customer pages) |

- `tests/e2e/smoke.py`: every demo account × every permitted page, **0 errors**.
- Manual visual review (screenshots at 1440 px) of the dashboard, sales orders, aging, ledger, delivery, invoice and simulator pages.

**Not tested:** any real SAP behaviour (there is no SAP connection); real invoice PDFs; server persistence;
concurrency; screen-reader walkthrough.

## 3. Incomplete backend / SAP dependencies

See `docs/SAP_INTEGRATION.md` §6. In short:
- BFF with server-side authentication and customer isolation;
- persistence;
- an implementation of each contract method against the chosen SAP interfaces;
- idempotency store and outbox;
- status-change intake;
- BP and material mapping sources, plus BP creation;
- live price, ATP and tax;
- invoice PDF retrieval;
- credit exposure;
- notification delivery;
- integration monitoring.
