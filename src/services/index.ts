import type { TradeFlowServices } from './contracts'
import { httpServices } from './api/http'

/** Single switch point for data services: every call goes to the TradeFlow API (see ./api). */
export const services: TradeFlowServices = httpServices

/** Shown in the UI wherever SAP data or actions appear, so development data is never presented as live. */
export const sapModeLabel = () => (services.sap.mode === 'mock' ? 'SAP: development stand-in (mock data) — not connected' : 'SAP: connected')
export let SAP_MODE: 'mock' | 'live' = services.sap.mode
export let SAP_MODE_LABEL = sapModeLabel()
/** Called once /system/info is known. */
export function refreshSapModeLabels() {
  SAP_MODE = services.sap.mode
  SAP_MODE_LABEL = sapModeLabel()
}

export type * from './contracts'
