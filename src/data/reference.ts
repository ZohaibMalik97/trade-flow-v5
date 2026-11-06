/**
 * Live reference data (brands, regions, categories, warehouses, countries, FX rates).
 *
 * Components import these collections directly; after sign-in (and for the public registration form) the
 * store replaces their contents in place with the data served by the API, so the UI always shows the
 * server's master data. Until then they are empty.
 */
import type { Brand, CurrencyCode, Product, Region, Territory } from '@/types/domain'
import { FX_PER_USD } from '@/utils/fx'

export const brands: Brand[] = []
export const regions: Region[] = []
export const CATEGORIES: Product['category'][] = []
export const WAREHOUSES: string[] = []
export const COUNTRIES: { country: string; territoryId: string }[] = []
/** Demo accounts offered on the sign-in page — only populated when the server runs in demo mode. */
export const DEMO_ACCOUNTS: { userId: string; email: string; label: string; description: string }[] = []

interface ServerWarehouse { id: string; name: string; regionId?: string; isDefault?: boolean }
let warehouses: ServerWarehouse[] = []
let territoryRegions: Record<string, string> = {}

const replace = <T,>(target: T[], items: T[]) => target.splice(0, target.length, ...items)

export interface ReferencePayload {
  brands?: (Brand & { active?: boolean })[]
  categories?: string[]
  regions?: Region[]
  warehouses?: ServerWarehouse[]
  currencies?: { code: string; ratePerUsd: number }[]
}

export function applyReference(ref: ReferencePayload, territories: Pick<Territory, 'id' | 'regionId' | 'countries'>[]) {
  if (ref.brands) replace(brands, ref.brands.filter((b) => b.active !== false))
  if (ref.categories) replace(CATEGORIES, ref.categories as Product['category'][])
  if (ref.regions) replace(regions, ref.regions)
  if (ref.warehouses) {
    warehouses = ref.warehouses
    replace(WAREHOUSES, ref.warehouses.map((w) => w.name))
  }
  for (const c of ref.currencies ?? []) if (c.ratePerUsd > 0) (FX_PER_USD as Record<string, number>)[c.code as CurrencyCode] = c.ratePerUsd
  applyTerritories(territories)
}

export function applyTerritories(territories: Pick<Territory, 'id' | 'regionId' | 'countries'>[]) {
  territoryRegions = Object.fromEntries(territories.map((t) => [t.id, t.regionId]))
  replace(COUNTRIES, territories.flatMap((t) => t.countries.map((country) => ({ country, territoryId: t.id }))).sort((a, b) => a.country.localeCompare(b.country)))
}

export function setDemoAccounts(list: typeof DEMO_ACCOUNTS) {
  replace(DEMO_ACCOUNTS, list)
}

/** Collection warehouse for a territory (the region's warehouse, else the default) — same rule as the server. */
export function warehouseFor(territoryId: string) {
  const region = territoryRegions[territoryId]
  return (warehouses.find((w) => w.regionId === region) ?? warehouses.find((w) => w.isDefault) ?? warehouses[0])?.name ?? ''
}
