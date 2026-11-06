/**
 * HTTP implementations of the service contracts (replaces ./mock). SAP data is always served by the
 * TradeFlow API, which resolves the caller's business partners from the authenticated session — the access
 * context passed by pages is ignored here on purpose (a browser-supplied scope is never an authorisation).
 */
import type { IntegrationEvent } from '@/types/domain'
import type { TradeFlowServices } from '../contracts'
import { api, qs } from './client'

let sapMode: 'mock' | 'live' = 'mock'
/** Set from /system/info at start-up so every SAP screen labels its data honestly. */
export const setSapMode = (mode: 'mock' | 'live') => (sapMode = mode)

export const httpServices: TradeFlowServices = {
  customers: {
    lookupCustomers: async (q) => (await api.get<import('@/types/domain').Customer[]>('/customers')).filter((c) => `${c.name} ${c.code}`.toLowerCase().includes(q.toLowerCase())),
    getCustomer: (id) => api.get(`/customers/${encodeURIComponent(id)}`),
  },
  catalog: {
    listProducts: (q = {}) => api.get(`/products${qs({ search: q.search, brandIds: q.brandIds, categories: q.categories })}`),
    getPriceAndAvailability: (productIds, customerId) => api.post('/products/price-availability', { customerId, productIds }),
  },
  orders: {
    // Submission is performed by the store (POST /requests/submit) — this contract method is kept for compatibility.
    submitRequest: async () => ({ id: '', ref: '', receivedAt: new Date().toISOString() }),
    getApprovalStatus: async (id) => (await api.get<import('@/types/domain').SalesOrderRequest>(`/requests/${encodeURIComponent(id)}`)).approvalSteps,
  },
  finance: {
    getProformaInvoice: (id) => api.get(`/invoices/${encodeURIComponent(id)}`),
    getPaymentStatus: async (invoiceId) => (await api.get<import('@/types/domain').Payment[]>('/payments')).find((p) => p.invoiceId === invoiceId),
  },
  logistics: {
    getShipmentStatus: (id) => api.get(`/shipments/${encodeURIComponent(id)}`),
  },
  communications: {
    listConversations: async (customerId) => (await api.get<import('@/types/domain').EmailThread[]>('/email/threads')).filter((t) => !customerId || t.customerId === customerId),
  },
  sap: {
    get mode() {
      return sapMode
    },
    // SAP orders are created server-side (POST /requests/{id}/sap-submission); the browser never builds SAP payloads.
    submitSalesOrder: async () => ({ ok: false, errorCode: 'NOT-SUPPORTED', message: 'SAP submission runs on the server.', retryable: false }),
  },
  sapData: {
    get mode() {
      return sapMode
    },
    listSalesOrders: (_ctx, q = {}) => api.get(`/sap/sales-orders${qs({ customerId: q.customerId, search: q.search, page: q.page, pageSize: q.pageSize })}`),
    getSalesOrder: (_ctx, so) => api.get(`/sap/sales-orders/${encodeURIComponent(so)}`),
    listDeliveries: (_ctx, q = {}) => api.get(`/sap/deliveries${qs({ customerId: q.customerId, soNumber: q.soNumber, page: q.page, pageSize: q.pageSize })}`),
    getDelivery: (_ctx, dn) => api.get(`/sap/deliveries/${encodeURIComponent(dn)}`),
    listInvoices: (_ctx, q = {}) => api.get(`/sap/invoices${qs({ customerId: q.customerId, openOnly: q.openOnly, page: q.page, pageSize: q.pageSize })}`),
    getInvoice: (_ctx, inv) => api.get(`/sap/invoices/${encodeURIComponent(inv)}`),
    getInvoiceDocument: async (_ctx, inv) => {
      const r = await api.get<{ available: boolean; url?: string; reason?: string }>(`/sap/invoices/${encodeURIComponent(inv)}/document`)
      return r.available && r.url ? { available: true as const, url: r.url } : { available: false as const, reason: r.reason ?? 'The official invoice document is not available.' }
    },
    listPayments: (_ctx, q = {}) => api.get(`/sap/payments${qs({ customerId: q.customerId, page: q.page, pageSize: q.pageSize })}`),
    getPayment: (_ctx, doc) => api.get(`/sap/payments/${encodeURIComponent(doc)}`),
    getLedger: (_ctx, customerId, q = {}) => api.get(`/sap/customers/${encodeURIComponent(customerId)}/ledger${qs({ from: q.from, to: q.to, page: q.page, pageSize: q.pageSize })}`),
    getAging: (_ctx, customerId) => api.get(`/sap/customers/${encodeURIComponent(customerId)}/aging`),
    getOutstanding: (_ctx, customerId) => api.get(`/sap/customers/${encodeURIComponent(customerId)}/outstanding`),
    getFinancialSummary: (_ctx, customerId) => api.get(`/sap/customers/${encodeURIComponent(customerId)}/summary`),
  },
  integration: {
    retry: (event: IntegrationEvent) => api.post(`/integration/events/${encodeURIComponent(event.id)}/retry`),
  },
}
