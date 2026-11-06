/**
 * Frontend service contracts.
 *
 * These interfaces are the seam between the UI and a future backend /
 * integration layer (for example a BFF that talks to SAP S/4HANA via
 * released APIs). The prototype ships only MOCK implementations
 * (see ./mock). No endpoints are assumed or invented here — a real
 * implementation decides its own transport.
 */
import type {
  ApprovalStep,
  CurrencyCode,
  Customer,
  EmailThread,
  IntegrationEvent,
  Payment,
  Product,
  ProformaInvoice,
  SalesOrderRequest,
  Shipment,
  StockStatus,
} from '@/types/domain'

import type { PublicApplicationView } from '@/workflow/publicView'
import type {
  AgingReport,
  FinancialSummary,
  LedgerPage,
  OutstandingReport,
  Paged,
  SapDeliveryView,
  SapEnvelope,
  SapInvoiceView,
  SapPaymentView,
  SapSalesOrder,
} from '@/types/sap'
/** The customers the current principal may see. The server enforces this independently. */
export interface SapAccessContext {
  customerIds: string[]
}

export interface ListQuery {
  customerId?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface SubmissionReceipt {
  id: string
  ref: string
  receivedAt: string
}

export interface PriceAvailability {
  productId: string
  currency: CurrencyCode
  unitPrice: number
  availableQty: number
  stockStatus: StockStatus
  /** Source marker so the UI can label values honestly ('mock' = development stand-in, 'live' = read from SAP). */
  source: 'mock' | 'live'
  /** Where the price came from: customer price list, general price list or list price × FX. */
  priceSource?: 'customer_price_list' | 'price_list' | 'list_price_fx'
  asOf?: string
}

export interface ProductQuery {
  search?: string
  brandIds?: string[]
  categories?: Product['category'][]
}

export interface CustomerService {
  lookupCustomers(query: string): Promise<Customer[]>
  getCustomer(id: string): Promise<Customer | undefined>
}

/**
 * Public application tracking (no sign-in).
 * A backend implementation MUST: look up by reference + verified email (or a
 * hashed, expiring single-purpose token), return only the applicant-safe
 * projection, use the same generic error for "not found" and "mismatch",
 * rate-limit per IP and per reference, and log every attempt.
 */
export type TrackingResult = { ok: true; view: PublicApplicationView } | { ok: false; error: string; locked?: boolean }

export interface ApplicationTrackingService {
  trackByEmail(ref: string, email: string): Promise<TrackingResult>
  trackByToken(ref: string, token: string): Promise<TrackingResult>
}

export interface CatalogService {
  listProducts(query?: ProductQuery): Promise<Product[]>
  getPriceAndAvailability(productIds: string[], customerId: string): Promise<PriceAvailability[]>
}

export interface SalesOrderService {
  submitRequest(request: Pick<SalesOrderRequest, 'customerId' | 'lines' | 'fulfilment'>): Promise<SubmissionReceipt>
  getApprovalStatus(requestId: string): Promise<ApprovalStep[]>
}

export interface FinanceService {
  getProformaInvoice(id: string): Promise<ProformaInvoice | undefined>
  getPaymentStatus(invoiceId: string): Promise<Payment | undefined>
}

export interface LogisticsService {
  getShipmentStatus(id: string): Promise<Shipment | undefined>
}

export interface CommunicationService {
  listConversations(customerId?: string): Promise<EmailThread[]>
}

export interface IntegrationService {
  /** Simulated retry — resolves with the record's new state. */
  retry(event: IntegrationEvent): Promise<IntegrationEvent>
}

/**
 * SAP sales-order submission.
 *
 * A real implementation MUST run server-side (BFF / integration layer) — SAP
 * credentials, client certificates and endpoint URLs never belong in this
 * frontend bundle. The browser should only call the BFF with the request id;
 * the BFF builds the payload from server-held data, calls SAP and persists the
 * response. No SAP endpoint is assumed here.
 */
export interface SapOrderItem {
  lineNo: number
  productId: string
  /** SAP material number from the product ↔ material mapping. */
  material: string
  sku: string
  quantity: number
  uom: string
  /** Approved unit price (net) in the order currency. */
  unitPrice: number
}

export interface SapSalesOrderPayload {
  /** Duplicate protection: the integration layer must return the existing order for a key it already processed. */
  idempotencyKey: string
  requestId: string
  requestRef: string
  customerId: string
  /** SAP sold-to BP from the customer ↔ BP mapping (never the TradeFlow id). Undefined → mapping missing. */
  soldTo?: string
  shipTo: string
  currency: CurrencyCode
  paymentTerms: string
  requestedDeliveryDate: string
  customerReference?: string
  remarks?: string
  items: SapOrderItem[]
}

export type SapSubmitResult =
  | { ok: true; documentNumber: string; confirmedQty: Record<string, number>; fullyConfirmed: boolean; existing?: boolean; message: string }
  | { ok: false; errorCode: string; message: string; retryable: boolean }

export interface SapOrderService {
  /** 'mock' = development mode (no SAP connection). 'live' would be a server-backed implementation. */
  readonly mode: 'mock' | 'live'
  submitSalesOrder(payload: SapSalesOrderPayload): Promise<SapSubmitResult>
}

/**
 * Read access to SAP documents for the portal (sales orders, deliveries, invoices, payments,
 * customer account). Every call carries the principal's access context; the production BFF must
 * derive it from the authenticated session and resolve the SAP business partner itself — a
 * customer id sent by the browser is a filter, never an authorisation.
 */
export interface SapCustomerDataService {
  readonly mode: 'mock' | 'live'
  listSalesOrders(ctx: SapAccessContext, q?: ListQuery): Promise<Paged<SapSalesOrder>>
  getSalesOrder(ctx: SapAccessContext, soNumber: string): Promise<SapEnvelope & { order: SapSalesOrder; deliveries: SapDeliveryView[]; invoices: SapInvoiceView[] }>
  listDeliveries(ctx: SapAccessContext, q?: ListQuery & { soNumber?: string }): Promise<Paged<SapDeliveryView>>
  getDelivery(ctx: SapAccessContext, deliveryNumber: string): Promise<SapEnvelope & { delivery: SapDeliveryView; order?: SapSalesOrder }>
  listInvoices(ctx: SapAccessContext, q?: ListQuery & { openOnly?: boolean }): Promise<Paged<SapInvoiceView>>
  getInvoice(ctx: SapAccessContext, invoiceNumber: string): Promise<SapEnvelope & { invoice: SapInvoiceView }>
  getInvoiceDocument(ctx: SapAccessContext, invoiceNumber: string): Promise<{ available: true; url: string } | { available: false; reason: string }>
  listPayments(ctx: SapAccessContext, q?: ListQuery): Promise<Paged<SapPaymentView>>
  getPayment(ctx: SapAccessContext, paymentDoc: string): Promise<SapEnvelope & { payment: SapPaymentView; invoices: SapInvoiceView[] }>
  getLedger(ctx: SapAccessContext, customerId: string, q?: { from?: string; to?: string; page?: number; pageSize?: number }): Promise<LedgerPage>
  getAging(ctx: SapAccessContext, customerId: string): Promise<AgingReport>
  getOutstanding(ctx: SapAccessContext, customerId: string): Promise<OutstandingReport>
  getFinancialSummary(ctx: SapAccessContext, customerId: string): Promise<FinancialSummary>
}

export interface TradeFlowServices {
  customers: CustomerService
  catalog: CatalogService
  orders: SalesOrderService
  finance: FinanceService
  logistics: LogisticsService
  communications: CommunicationService
  integration: IntegrationService
  sap: SapOrderService
  sapData: SapCustomerDataService
}
