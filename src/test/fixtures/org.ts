import type { DemoUser, Region, Territory } from '@/types/domain'
import { ago } from '@/utils/time'

const I = 'internal' as const
const X = 'external' as const

/**
 * Seeded users. `roleIds` = user_roles; territoryIds / regionId / reviewRegionIds / customerId = user_assignments.
 *
 * The demo is built around FIVE primary accounts (see DEMO_ACCOUNTS). The other
 * internal users are background sales staff so that territory restrictions are
 * visible (each Account Manager sees only their own territories); the
 * external users are additional customers / prospective customers.
 */
export const users: DemoUser[] = [
  // ── Primary demo accounts ──
  { id: 'u-dist', name: 'Omar Haddad', email: 'omar.haddad@gulfhorizon.example', title: 'Purchasing Director, Gulf Horizon Trading', roleIds: ['customer'], kind: X, customerId: 'c-001', active: true, lastActiveAt: ago(0, 1) },
  { id: 'u-tm1', name: 'Daniel Okafor', email: 'daniel.okafor@tradeflow.example', title: 'Account Manager — Gulf (UAE, Oman, Qatar, Bahrain, Kuwait)', roleIds: ['territory_sales_manager'], kind: I, department: 'Sales', territoryIds: ['t-uae', 't-gcc'], active: true, lastActiveAt: ago(0, 2) },
  { id: 'u-gm', name: 'Marcus Chen', email: 'marcus.chen@tradeflow.example', title: 'Head of Sales', roleIds: ['head_of_sales'], kind: I, department: 'Sales', active: true, lastActiveAt: ago(0, 4) },
  { id: 'u-sc', name: 'Priya Nair', email: 'priya.nair@tradeflow.example', title: 'Customer Onboarding & Sales Operations', roleIds: ['onboarding_approver', 'operations_reviewer'], kind: I, department: 'Sales Operations', reviewRegionIds: ['r-me', 'r-af', 'r-eu', 'r-apac'], active: true, lastActiveAt: ago(0, 0.2) },
  { id: 'u-admin', name: 'Elena Petrova', email: 'elena.petrova@tradeflow.example', title: 'System Administrator', roleIds: ['admin'], kind: I, department: 'IT', active: true, lastActiveAt: ago(0, 6) },

  // ── Background sales staff (other territories) ──
  { id: 'u-tm2', name: 'Faisal Rahman', email: 'faisal.rahman@tradeflow.example', title: 'Account Manager — Saudi Arabia', roleIds: ['territory_sales_manager'], kind: I, department: 'Sales', territoryIds: ['t-ksa'], active: true, lastActiveAt: ago(0, 5) },
  { id: 'u-tm3', name: 'Sofia Lindqvist', email: 'sofia.lindqvist@tradeflow.example', title: 'Account Manager — UK & Western Europe', roleIds: ['territory_sales_manager'], kind: I, department: 'Sales', territoryIds: ['t-uk', 't-weu'], active: true, lastActiveAt: ago(1) },
  { id: 'u-tm4', name: 'Ken Tanaka', email: 'ken.tanaka@tradeflow.example', title: 'Account Manager — Asia', roleIds: ['territory_sales_manager'], kind: I, department: 'Sales', territoryIds: ['t-sea', 't-sa'], active: true, lastActiveAt: ago(0, 7) },
  { id: 'u-tm5', name: 'Amara Mensah', email: 'amara.mensah@tradeflow.example', title: 'Account Manager — East Africa', roleIds: ['territory_sales_manager'], kind: I, department: 'Sales', territoryIds: ['t-eaf'], active: true, lastActiveAt: ago(2) },

  // ── Other customers and prospective customers ──
  { id: 'u-jonas', name: 'Jonas Becker', email: 'jonas@nordlicht.example', title: 'Einkaufsleiter, Nordlicht Parfümerie', roleIds: ['customer'], kind: X, customerId: 'c-011', active: true, lastActiveAt: ago(3) },
  { id: 'u-app1', name: 'Huda Al-Ghamdi', email: 'huda@desertbloom.example', title: 'Chief Executive, Desert Bloom Cosmetics', roleIds: ['applicant'], kind: X, active: true, lastActiveAt: ago(1) },
  { id: 'u-app2', name: 'Neema Mushi', email: 'neema@lagoonbeauty.example', title: 'Procurement Lead, Lagoon Beauty', roleIds: ['applicant'], kind: X, active: true, lastActiveAt: ago(2) },
  { id: 'u-app3', name: 'Tom Ashworth', email: 'tom@auroratrade.example', title: 'Founder, Aurora Trade Co', roleIds: ['applicant'], kind: X, active: true, lastActiveAt: ago(0, 6) },
  { id: 'u-app4', name: 'Dilshan Perera', email: 'dilshan@lankaaroma.example', title: 'Director, Lanka Aroma', roleIds: ['applicant'], kind: X, active: true, lastActiveAt: ago(15) },
  { id: 'u-app5', name: 'Rafael Costa', email: 'rafael@atlanticscents.example', title: 'Managing Director, Atlantic Scents', roleIds: ['applicant'], kind: X, active: true, lastActiveAt: ago(0, 9) },
  { id: 'u-app6', name: 'Ali Al-Khalifa', email: 'ali@bahrainfragrance.example', title: 'Owner, Bahrain Fragrance Hub', roleIds: ['applicant'], kind: X, active: true, lastActiveAt: ago(0, 20) },
  { id: 'u-app7', name: 'Siti Rahman', email: 'siti@klessence.example', title: 'Director, KL Essence Sdn Bhd', roleIds: ['applicant'], kind: X, active: true, lastActiveAt: ago(2) },

  { id: 'u-system', name: 'TradeFlow Workflow', email: 'workflow@tradeflow.example', title: 'System', roleIds: [], kind: I, active: true, lastActiveAt: ago(0) },
]

/** The five primary demo accounts offered on the sign-in page (all use the demo password). */
export const DEMO_ACCOUNTS: { userId: string; label: string; description: string }[] = [
  { userId: 'u-dist', label: 'Customer Portal User', description: 'Catalogue, prices & stock, sales requests, own profile' },
  { userId: 'u-sc', label: 'Customer Onboarding Approver', description: 'Approves registrations · also Operations (invoices, payments, shipments)' },
  { userId: 'u-tm1', label: 'Sales Representative / Account Manager', description: 'Approves Gulf customers’ sales requests, initiates SAP submission' },
  { userId: 'u-gm', label: 'Head of Sales', description: 'Second-level approval of elevated requests; all territories' },
  { userId: 'u-admin', label: 'Administrator', description: 'Users, roles, permissions, configuration, audit' },
]

export const regions: Region[] = [
  { id: 'r-me', name: 'Middle East', managerId: 'u-gm' },
  { id: 'r-eu', name: 'Europe', managerId: 'u-gm' },
  { id: 'r-apac', name: 'Asia Pacific', managerId: 'u-gm' },
  { id: 'r-af', name: 'Africa', managerId: 'u-gm' },
]

const ALL_BRANDS = ['b-velour', 'b-oud', 'b-noire', 'b-cedar', 'b-aurelle']

export const territories: Territory[] = [
  { id: 't-uae', name: 'UAE & Oman', regionId: 'r-me', countries: ['United Arab Emirates', 'Oman'], managerId: 'u-tm1', defaultCurrency: 'AED', visibleBrandIds: ALL_BRANDS },
  { id: 't-gcc', name: 'Qatar, Bahrain & Kuwait', regionId: 'r-me', countries: ['Qatar', 'Bahrain', 'Kuwait'], managerId: 'u-tm1', defaultCurrency: 'QAR', visibleBrandIds: ALL_BRANDS },
  { id: 't-ksa', name: 'Saudi Arabia', regionId: 'r-me', countries: ['Saudi Arabia'], managerId: 'u-tm2', defaultCurrency: 'SAR', visibleBrandIds: ALL_BRANDS },
  { id: 't-uk', name: 'UK & Ireland', regionId: 'r-eu', countries: ['United Kingdom', 'Ireland'], managerId: 'u-tm3', defaultCurrency: 'GBP', visibleBrandIds: ['b-velour', 'b-noire', 'b-cedar', 'b-aurelle'] },
  { id: 't-weu', name: 'Western Europe', regionId: 'r-eu', countries: ['France', 'Germany', 'Belgium', 'Netherlands'], managerId: 'u-tm3', defaultCurrency: 'EUR', visibleBrandIds: ['b-velour', 'b-noire', 'b-cedar', 'b-aurelle'] },
  { id: 't-sea', name: 'Southeast Asia', regionId: 'r-apac', countries: ['Singapore', 'Malaysia'], managerId: 'u-tm4', defaultCurrency: 'SGD', visibleBrandIds: ALL_BRANDS },
  { id: 't-sa', name: 'South Asia', regionId: 'r-apac', countries: ['Pakistan', 'India', 'Sri Lanka'], managerId: 'u-tm4', defaultCurrency: 'USD', visibleBrandIds: ['b-velour', 'b-oud', 'b-aurelle'] },
  { id: 't-eaf', name: 'East Africa', regionId: 'r-af', countries: ['Kenya', 'Tanzania'], managerId: 'u-tm5', defaultCurrency: 'USD', visibleBrandIds: ['b-velour', 'b-oud', 'b-cedar'] },
]

export const COUNTRIES = territories.flatMap((t) => t.countries.map((c) => ({ country: c, territoryId: t.id }))).sort((a, b) => a.country.localeCompare(b.country))

export const WAREHOUSES = ['Jebel Ali DC — Dubai', 'Rotterdam DC — Netherlands', 'Tuas DC — Singapore']
