import type { CurrencyCode } from '@/types/domain'

/**
 * FX rates (1 USD = x) used for USD-equivalent figures in the UI. These start values are overwritten at sign-in
 * with the rates maintained on the server (GET /reference → currencies; administrators update them through
 * PUT /currencies/{code}/rate). Prices and order totals themselves are always calculated on the server.
 */
export const FX_PER_USD: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.6725,
  SAR: 3.75,
  QAR: 3.64,
  SGD: 1.34,
}

export const fromUsd = (usd: number, to: CurrencyCode) => usd * FX_PER_USD[to]
export const toUsd = (amount: number, from: CurrencyCode) => amount / FX_PER_USD[from]
export const roundMoney = (v: number) => Math.round(v * 100) / 100
