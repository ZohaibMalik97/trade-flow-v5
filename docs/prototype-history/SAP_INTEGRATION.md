# TradeFlow ↔ SAP — integration architecture and open backend work

**Status of this codebase:** frontend only. There is **no backend and no SAP connection**. Every SAP
screen reads through a typed service contract whose only implementation is a clearly labelled
**development mock** (`src/services/sapDevMock.ts`). In the UI it shows as
"Source: SAP development mock — not connected to SAP", and all document numbers start with `MOCK-`.
Nothing in the frontend holds SAP endpoints or credentials, and none should be added.

## 1. What was found when the existing app was inspected

| Question (spec §12) | Finding |
|---|---|
| Does SAP integration exist? | No. Only service interfaces and mocks (`src/services/contracts.ts`, `mock.ts`). |
| Backend API? | None. The app is a Vite/React SPA with state in browser storage. |
| Customer / product mappings? | Not present before this round. Added: `Customer.sapBusinessPartner` and `Product.sapMaterial`. Both deliberately differ from TradeFlow ids. |
| Stock and pricing | Seeded values in the browser (labelled "demo data — not live SAP"). |
| SAP sales-order creation | Contract existed (round 4); now idempotent and backed by the development stand-in. |
| Deliveries, invoices, payments, ledger, aging | Not available before. Contract + stand-in added this round. |
| Authentication / authorisation | Simulated in the browser (see `ACCESS_CONTROL_AND_WORKFLOW.md`). Must move server-side. |

## 2. Target architecture

```
Browser (TradeFlow SPA) ──HTTPS, session cookie──▶ TradeFlow BFF / integration layer ──▶ SAP S/4HANA
                                                   • authenticates the user            (released APIs via
                                                   • resolves customer → SAP BP          SAP BTP / Cloud Connector
                                                   • enforces customer isolation         or API Management)
                                                   • holds SAP credentials (vault)
                                                   • idempotency store, outbox, retries
                                                   • event intake / polling → status sync
```

The frontend contracts that the BFF must implement (`src/services/contracts.ts`):

| Contract method | Purpose | Notes for the BFF |
|---|---|---|
| `SapOrderService.submitSalesOrder(payload)` | Create SAP sales order from an approved request | Browser sends only the request id in production; BFF rebuilds the payload from server data. Idempotency key = TradeFlow request id. |
| `SapCustomerDataService.listSalesOrders / getSalesOrder` | Order header, items (ordered / confirmed / delivered / billed), statuses | SAP order status, delivery status and billing status are read, never derived from TradeFlow fields. |
| `listDeliveries / getDelivery` | Outbound deliveries, goods issue, proof of delivery | Several deliveries per order supported. |
| `listInvoices / getInvoice` | Billing documents incl. credit memos and cancellations | Amount paid / credits / outstanding come from SAP open items and clearing. |
| `getInvoiceDocument` | Official PDF | Return a short-lived signed URL streamed by the BFF; never generate a look-alike. |
| `listPayments / getPayment` | Posted incoming payments and their allocations | Unallocated payments must be shown as such. |
| `getLedger` | Customer line items with opening balance, running balance, closing balance | Date filter + server-side paging. |
| `getOutstanding / getAging` | Open items, overdue split, aging buckets | Prefer SAP's own aging output if available (see §5). |
| `getFinancialSummary` | Dashboard KPIs | Single summary call — avoid fetching full history for KPIs. |

Each call carries an **access context**. In production the BFF derives it from the authenticated
session (customer user → own BP; staff → BPs of their territories). A customer id sent by the
browser is only a filter and must be re-checked. The development stand-in enforces exactly this
rule, and the tests prove that one customer cannot read another customer's documents.

### Candidate SAP interfaces (to be confirmed by the SAP team — none are called)

The SAP team must choose the interfaces for the client's S/4HANA release (SAP Business Accelerator Hub).
Typical released OData APIs that cover the operations above: Sales Order (`API_SALES_ORDER_SRV`),
Outbound Delivery (`API_OUTBOUND_DELIVERY_SRV`), Billing Document (`API_BILLING_DOCUMENT_SRV`),
Business Partner (`API_BUSINESS_PARTNER`), Product (`API_PRODUCT_SRV`), Material Stock
(`API_MATERIAL_STOCK_SRV`) and journal-entry/open-item reads for the customer account
(e.g. `API_OPLACCTGDOCITEMCUBE_SRV`). Pricing, ATP, credit management and invoice PDF output may need
additional or custom services. Treat this list as a starting point for validation, not as a decision.

## 3. Mappings

| TradeFlow | SAP | Where | Maintained by |
|---|---|---|---|
| `Customer.id` / `code` | Sold-to Business Partner | `Customer.sapBusinessPartner` | Customer detail page → "SAP business partner" (permission `customer.manage`, audited, one BP per customer). Unmapped customers cannot get SAP orders (`BP-NOT-MAPPED`) and see "Account not linked to SAP yet". |
| `Product.id` / `sku` | Material number | `Product.sapMaterial` | Seed / product master sync. |
| Request id | Idempotency key, and the customer reference on the SAP order | `SalesOrderRequest.sap.idempotencyKey` | Automatic. |

Still to be agreed with the SAP team: sales organisation, distribution channel, division, order type,
ship-to partner determination, incoterms, plant/shipping point, and how customer remarks map to SAP texts.

## 4. Sales-order creation and duplicate prevention

1. Internal approval completes → request status **Approved**, SAP record **Pending SAP Creation**. No SAP number exists.
2. TradeFlow requests creation (the UI triggers it right after approval; in production the BFF should react to the approval event through an outbox so a closed browser cannot lose it).
3. The BFF calls SAP with the **idempotency key**. If the key was already processed, it returns the existing order instead of creating another one.
4. Outcomes, recorded per attempt (time, user, outcome, error code/message):
   - **Sales Order Created**: the SAP number is stored. Partial ATP confirmation is flagged.
   - **SAP Creation Failed**: the approval is kept, and staff with `order.sap_submit` can retry. The customer sees "taking longer than usual", never error codes, and is never asked to resubmit.
   - **Existing order returned**: a retry after a lost response returns the order SAP had already created. Tested in `T5b` and in `sap.test.ts`.
5. Integration Monitor lists every attempt. Sales-order events can be retried only from the request (the idempotent path), never by "mark as synced".

## 5. Status model (one status per stage)

| Stage | Field / source | Values |
|---|---|---|
| Sales request (TradeFlow) | `SalesOrderRequest.status` | Draft, Pending Approval (Under Review at an escalated level), Returned for Clarification, Approved, Rejected, Cancelled |
| SAP order creation (TradeFlow) | `SalesOrderRequest.sap.status` | Pending SAP Creation, SAP Creation Failed, Sales Order Created |
| SAP sales order | SAP | Open (shown as Sales Order Created), In Process, Partially Delivered, Fully Delivered, Completed, Cancelled |
| Delivery | SAP outbound delivery | In Picking, Goods Issued, Delivered (proof of delivery), Cancelled |
| Customer receipt | TradeFlow `GoodsReceiptAck` | Awaiting confirmation, Received in full, Received with discrepancy (+ discrepancy Open/Resolved) |
| Invoice | SAP billing + open items | Open, Partially Paid, Overdue, Paid, Cancelled |
| Payment | SAP | Fully / Partially Allocated, Unallocated, Reversed |
| Payment advice (TradeFlow, optional) | `Payment` (existing) | Awaiting Receipt, Receipt Uploaded, Verified/Rejected. Never changes an SAP invoice. |

**Goods-receipt confirmation is a customer acknowledgement** stored in TradeFlow
(`sapUpdate: 'Not required — customer acknowledgement only'`). If the business later wants an
SAP update (for example proof of delivery or a quality notification), the BFF must perform it and
TradeFlow must show "SAP updated" only after SAP confirms.

### Aging and outstanding logic (implemented in the stand-in; the BFF must match or replace it)

- Open item = invoice gross − allocated payments − applied credit memos. Cancelled invoices have no open amount.
- Days overdue = reporting date (start of today) − net due date, floored at 0.
- Buckets: Not yet due (≤ 0), 1–30, 31–60, 61–90, > 90 days.
- Net balance = open items − unallocated payments. This equals the ledger closing balance, and the tests assert it.
- If SAP provides aging values (for example a customer-aging report), the BFF should return those and set `basis` accordingly, so the frontend never shows a conflicting calculation.

## 6. Required but unavailable (backend / SAP work list)

1. BFF with real authentication (SSO) and server-side permission and customer-scope checks on every call.
2. Persistence for requests, approvals, comments, goods-receipt acknowledgements and audit, which today live in browser storage.
3. Implementation of every contract method above against the chosen SAP interfaces, with paging and timeouts.
4. Idempotency store and outbox for sales-order creation, plus event intake (webhook/Event Mesh) or polling for order, delivery and billing status changes.
5. Customer ↔ BP and product ↔ material mapping sources, and BP creation for newly approved customers.
6. Live price, ATP stock and tax determination with as-of timestamps.
7. Official invoice PDF retrieval (signed, short-lived download URLs).
8. Credit-exposure figures, only if SAP credit management is used and customers may see them.
9. Notification delivery (email) for order, delivery, invoice and payment events.
10. Monitoring and alerting for integration failures; retention and archiving of attempts.

## 7. Development stand-in and simulator

`Administration › Integration Monitor` shows a **SAP development simulator** while the SAP service
runs in mock mode, for users with `integration.retry`. It can:
- toggle SAP availability (portal shows an outage state);
- force the next order creation to time out, either before or after SAP commits;
- post full or partial deliveries and record proof of delivery;
- run billing;
- post incoming payments, allocated to the oldest invoices or left unallocated;
- cancel an invoice.

It writes only to the stand-in's own browser storage (`tradeflow-sap-devmock`). "Reset demo data"
resets it together with TradeFlow's own state.
