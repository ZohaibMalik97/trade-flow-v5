/**
 * Seeded customer applications with consistent workflow histories.
 * Each history row mirrors what the workflow engine records, so seeded and newly
 * created applications behave identically.
 */
import type { Address, ApplicationDocument, ApplicationStatus, RegistrationApplication, WorkflowActionType, WorkflowEvent } from '@/types/domain'
import { ago, ahead } from '@/utils/time'
const randomToken = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
import { ONBOARDING_WORKFLOW_ID } from '@/workflow/onboarding'
import { contentOf } from '@/workflow/engine'

const addr = (line1: string, city: string, country: string, postalCode?: string): Address => ({ line1, city, country, postalCode })

type Ev = [days: number, actorId: string, action: WorkflowActionType, toStatus: ApplicationStatus, extra?: Partial<WorkflowEvent>]

function history(appId: string, evs: Ev[]): WorkflowEvent[] {
  return evs.map(([d, actorId, action, toStatus, extra], i) => ({
    id: `wf-${appId}-${i}`,
    at: ago(d),
    actorId,
    action,
    toStatus,
    visibility: 'public',
    revision: 1,
    ...extra,
  }))
}

function docs(list: [string, ApplicationDocument['type'], number][], days: number, revision = 1): ApplicationDocument[] {
  return list.map(([name, type, sizeKb], i) => ({ id: `ad-${name.slice(0, 12)}-${i}-${revision}`, name, type, sizeKb, uploadedAt: ago(days), revision }))
}

type Base = Omit<RegistrationApplication, 'revisions' | 'trackingToken' | 'trackingTokenExpiresAt' | 'workflowId'>

function app(b: Base): RegistrationApplication {
  return {
    ...b,
    workflowId: ONBOARDING_WORKFLOW_ID,
    revisions: b.submittedAt ? [{ revision: 1, submittedAt: b.submittedAt, content: contentOf(b) }] : [],
    trackingToken: randomToken(),
    trackingTokenExpiresAt: ahead(30),
  }
}

export const applications: RegistrationApplication[] = [
  // Under review by the Customer Onboarding Approver
  app({
    id: 'a-001', ref: 'APP-2026-0311', companyName: 'Desert Bloom Cosmetics', legalName: 'Desert Bloom Cosmetics Trading Est.', crNumber: '4030-118-772', taxNumber: 'VAT 300551882200003',
    country: 'Saudi Arabia', city: 'Jeddah', territoryId: 't-ksa', website: 'desertbloom.example', businessType: 'Wholesale distributor', annualVolumeBand: 'USD 500k – 1M',
    contact: { name: 'Huda Al-Ghamdi', role: 'Chief Executive', email: 'huda@desertbloom.example', phone: '+966 12 555 0144' },
    requestedBrandIds: ['b-oud', 'b-velour'],
    billingAddress: addr('Tahlia Street, Al Andalus', 'Jeddah', 'Saudi Arabia', '23326'),
    deliveryAddress: addr('Al Khumrah Logistics Zone, Bay 11', 'Jeddah', 'Saudi Arabia', '22528'),
    documents: docs([['Commercial_Registration_DesertBloom.pdf', 'Commercial Registration', 812], ['VAT_Certificate.pdf', 'Tax Certificate', 344], ['Bank_Reference_Letter.pdf', 'Bank Reference Letter', 210]], 5),
    status: 'Under Review', applicantUserId: 'u-app1', createdAt: ago(5, 2), submittedAt: ago(5), updatedAt: ago(4),
    currentStageId: 'initial_review', assignedToUserId: 'u-sc', stageEnteredAt: ago(5), revision: 1,
    history: history('a-001', [
      [5, 'u-app1', 'submit', 'Submitted', { toStageId: 'initial_review' }],
      [5, 'system', 'assign', 'Submitted', { toStageId: 'initial_review', toUserId: 'u-sc' }],
      [4, 'u-sc', 'start_review', 'Under Review', { fromStatus: 'Submitted', fromStageId: 'initial_review', toStageId: 'initial_review', toUserId: 'u-sc' }],
    ]),
  }),
  // Returned for correction by the initial reviewer
  app({
    id: 'a-002', ref: 'APP-2026-0306', companyName: 'Lagoon Beauty', legalName: 'Lagoon Beauty Limited', crNumber: 'PVT-AAB1928', taxNumber: 'Pending',
    country: 'Tanzania', city: 'Dar es Salaam', territoryId: 't-eaf', businessType: 'Retail chain', annualVolumeBand: 'USD 100k – 500k',
    contact: { name: 'Neema Mushi', role: 'Procurement Lead', email: 'neema@lagoonbeauty.example', phone: '+255 22 555 0101' },
    requestedBrandIds: ['b-velour', 'b-cedar'],
    billingAddress: addr('Masaki, Haile Selassie Road 88', 'Dar es Salaam', 'Tanzania'),
    deliveryAddress: addr('Mikocheni Light Industrial Area, Plot 5', 'Dar es Salaam', 'Tanzania'),
    documents: docs([['Certificate_of_Incorporation.pdf', 'Commercial Registration', 640]], 9),
    status: 'Returned for Information', applicantUserId: 'u-app2', createdAt: ago(9, 3), submittedAt: ago(9), updatedAt: ago(7), revision: 1,
    currentStageId: 'initial_review',
    returnInfo: {
      type: 'correction', fromStageId: 'initial_review', byUserId: 'u-sc', at: ago(7), editableSections: ['company', 'documents'],
      instructions: 'Please enter your Tax Identification Number (TIN) in place of “Pending”, upload the TIN certificate, and add a bank reference letter dated within the last 3 months.',
    },
    history: history('a-002', [
      [9, 'u-app2', 'submit', 'Submitted', { toStageId: 'initial_review' }],
      [9, 'system', 'assign', 'Submitted', { toStageId: 'initial_review', toUserId: 'u-sc' }],
      [8, 'u-sc', 'start_review', 'Under Review', { fromStatus: 'Submitted', fromStageId: 'initial_review', toStageId: 'initial_review', toUserId: 'u-sc' }],
      [7, 'u-sc', 'return_to_requester', 'Returned for Information', {
        fromStatus: 'Under Review', fromStageId: 'initial_review', toUserId: 'u-app2',
        publicRemarks: 'Please enter your Tax Identification Number (TIN) in place of “Pending”, upload the TIN certificate, and add a bank reference letter dated within the last 3 months.',
        remarks: 'Tax number missing — cannot run the compliance screening without it.',
      }],
    ]),
  }),
  // Newly submitted
  app({
    id: 'a-003', ref: 'APP-2026-0314', companyName: 'Aurora Trade Co', legalName: 'Aurora Trade Co Ltd', crNumber: 'UK 13398204', taxNumber: 'GB 401 2290 17',
    country: 'United Kingdom', city: 'Manchester', territoryId: 't-uk', website: 'auroratrade.example', businessType: 'Online retailer', annualVolumeBand: 'USD 100k – 500k',
    contact: { name: 'Tom Ashworth', role: 'Founder', email: 'tom@auroratrade.example', phone: '+44 161 555 0193' },
    requestedBrandIds: ['b-noire', 'b-cedar', 'b-aurelle'],
    billingAddress: addr('3 Hardman Street, Spinningfields', 'Manchester', 'United Kingdom', 'M3 3HF'),
    deliveryAddress: addr('Trafford Park, Unit 12B', 'Manchester', 'United Kingdom', 'M17 1PG'),
    documents: docs([['Companies_House_Certificate.pdf', 'Commercial Registration', 402], ['VAT_Registration.pdf', 'Tax Certificate', 188]], 0.3),
    status: 'Submitted', applicantUserId: 'u-app3', createdAt: ago(0, 9), submittedAt: ago(0, 6), updatedAt: ago(0, 6), revision: 1,
    currentStageId: 'initial_review', assignedToUserId: 'u-sc', stageEnteredAt: ago(0, 6),
    history: history('a-003', [
      [0.25, 'u-app3', 'submit', 'Submitted', { toStageId: 'initial_review' }],
      [0.25, 'system', 'assign', 'Submitted', { toStageId: 'initial_review', toUserId: 'u-sc' }],
    ]),
  }),
  // Rejected by the Customer Onboarding Approver
  app({
    id: 'a-004', ref: 'APP-2026-0297', companyName: 'Lanka Aroma', legalName: 'Lanka Aroma (Private) Limited', crNumber: 'PV 00218841', taxNumber: 'TIN 114882210',
    country: 'Sri Lanka', city: 'Colombo', territoryId: 't-sa', businessType: 'Wholesale distributor', annualVolumeBand: 'Below USD 100k',
    contact: { name: 'Dilshan Perera', role: 'Director', email: 'dilshan@lankaaroma.example', phone: '+94 11 555 0128' },
    requestedBrandIds: ['b-oud'],
    billingAddress: addr('Galle Road 221', 'Colombo', 'Sri Lanka'),
    deliveryAddress: addr('Biyagama EPZ, Unit 7', 'Colombo', 'Sri Lanka'),
    documents: docs([['Business_Registration.pdf', 'Commercial Registration', 520], ['Tax_Certificate.pdf', 'Tax Certificate', 230]], 21),
    status: 'Rejected', applicantUserId: 'u-app4', createdAt: ago(21, 4), submittedAt: ago(21), updatedAt: ago(15), revision: 1,
    history: history('a-004', [
      [21, 'u-app4', 'submit', 'Submitted', { toStageId: 'initial_review' }],
      [21, 'system', 'assign', 'Submitted', { toStageId: 'initial_review', toUserId: 'u-sc' }],
      [19, 'u-sc', 'start_review', 'Under Review', { fromStatus: 'Submitted', fromStageId: 'initial_review', toStageId: 'initial_review', toUserId: 'u-sc' }],
      [15, 'u-sc', 'reject', 'Rejected', {
        fromStatus: 'Under Review', fromStageId: 'initial_review',
        publicRemarks: 'Oud Atelier is covered by an exclusive distribution agreement in Sri Lanka until Q4 2027. You are welcome to apply again for other brands.',
        remarks: 'Exclusive agreement with Ceylon Luxe Distributors (contract ref CL-2024-07).',
      }],
    ]),
  }),
  // Approved — Nordlicht (now customer account c-011)
  app({
    id: 'a-005', ref: 'APP-2026-0288', companyName: 'Nordlicht Parfümerie', legalName: 'Nordlicht Parfümerie GmbH', crNumber: 'HRB 174422', taxNumber: 'DE 318844120',
    country: 'Germany', city: 'Hamburg', territoryId: 't-weu', businessType: 'Specialist perfumery', annualVolumeBand: 'USD 100k – 500k',
    contact: { name: 'Jonas Becker', role: 'Einkaufsleiter', email: 'jonas@nordlicht.example', phone: '+49 40 555 01 66' },
    requestedBrandIds: ['b-noire', 'b-cedar'],
    billingAddress: addr('Neuer Wall 41', 'Hamburg', 'Germany', '20354'),
    deliveryAddress: addr('Billbrookdeich 210', 'Hamburg', 'Germany', '22113'),
    documents: docs([['Handelsregisterauszug.pdf', 'Commercial Registration', 380], ['USt-IdNr_Bestaetigung.pdf', 'Tax Certificate', 150]], 34),
    status: 'Approved', applicantUserId: 'u-jonas', createdAt: ago(35), submittedAt: ago(34), updatedAt: ago(21), revision: 1, customerId: 'c-011',
    history: history('a-005', [
      [34, 'u-jonas', 'submit', 'Submitted', { toStageId: 'initial_review' }],
      [34, 'system', 'assign', 'Submitted', { toStageId: 'initial_review', toUserId: 'u-sc' }],
      [32, 'u-sc', 'start_review', 'Under Review', { fromStatus: 'Submitted', fromStageId: 'initial_review', toStageId: 'initial_review', toUserId: 'u-sc' }],
      [21, 'u-sc', 'approve', 'Approved', { fromStatus: 'Under Review', fromStageId: 'initial_review', remarks: 'All documents verified; no channel conflict in Hamburg.', publicRemarks: 'Welcome to the TradeFlow customer network.' }],
      [21, 'system', 'account_created', 'Approved', { remarks: 'Customer account CUST-10092 created (demo).' }],
    ]),
  }),
  // Approved long ago — Gulf Horizon (customer c-001)
  app({
    id: 'a-000', ref: 'APP-2024-0042', companyName: 'Gulf Horizon Trading', legalName: 'Gulf Horizon Trading LLC', crNumber: 'DXB-CR-884213', taxNumber: 'TRN 100384712900003',
    country: 'United Arab Emirates', city: 'Dubai', territoryId: 't-uae', businessType: 'Wholesale distributor', annualVolumeBand: 'Above USD 1M',
    contact: { name: 'Omar Haddad', role: 'Purchasing Director', email: 'omar.haddad@gulfhorizon.example', phone: '+971 4 555 0142' },
    requestedBrandIds: ['b-velour', 'b-oud', 'b-noire', 'b-aurelle'],
    billingAddress: addr('Office 1804, Bay Square Tower 2, Business Bay', 'Dubai', 'United Arab Emirates'),
    deliveryAddress: addr('Warehouse 7, Al Quoz Industrial Area 3', 'Dubai', 'United Arab Emirates'),
    documents: docs([['Trade_License_GHT.pdf', 'Trade License', 720], ['TRN_Certificate.pdf', 'Tax Certificate', 260]], 1000),
    status: 'Approved', applicantUserId: 'u-dist', createdAt: ago(1001), submittedAt: ago(1000), updatedAt: ago(980), revision: 1, customerId: 'c-001',
    history: history('a-000', [
      [1000, 'u-dist', 'submit', 'Submitted', { toStageId: 'initial_review' }],
      [1000, 'system', 'assign', 'Submitted', { toStageId: 'initial_review', toUserId: 'u-sc' }],
      [998, 'u-sc', 'start_review', 'Under Review', { fromStatus: 'Submitted', fromStageId: 'initial_review', toStageId: 'initial_review', toUserId: 'u-sc' }],
      [981, 'u-sc', 'approve', 'Approved', { fromStatus: 'Under Review', fromStageId: 'initial_review' }],
      [980, 'system', 'account_created', 'Approved', { remarks: 'Customer account CUST-10021 created (demo).' }],
    ]),
  }),
  // Under review (large account)
  app({
    id: 'a-006', ref: 'APP-2026-0309', companyName: 'Atlantic Scents', legalName: 'Atlantic Scents B.V.', crNumber: 'KvK 81122945', taxNumber: 'NL 862311904B01',
    country: 'Netherlands', city: 'Rotterdam', territoryId: 't-weu', website: 'atlanticscents.example', businessType: 'Wholesale distributor', annualVolumeBand: 'Above USD 1M',
    contact: { name: 'Rafael Costa', role: 'Managing Director', email: 'rafael@atlanticscents.example', phone: '+31 10 555 0177' },
    requestedBrandIds: ['b-velour', 'b-noire', 'b-aurelle'],
    billingAddress: addr('Wilhelminakade 91', 'Rotterdam', 'Netherlands', '3072 AP'),
    deliveryAddress: addr('Maasvlakte Distripark, Hall 4', 'Rotterdam', 'Netherlands', '3199 LZ'),
    documents: docs([['KvK_Uittreksel.pdf', 'Commercial Registration', 410], ['BTW_Certificate.pdf', 'Tax Certificate', 175], ['Bank_Reference_ABN.pdf', 'Bank Reference Letter', 198]], 8),
    status: 'Under Review', applicantUserId: 'u-app5', createdAt: ago(8, 3), submittedAt: ago(8), updatedAt: ago(7), revision: 1,
    currentStageId: 'initial_review', assignedToUserId: 'u-sc', stageEnteredAt: ago(8),
    history: history('a-006', [
      [8, 'u-app5', 'submit', 'Submitted', { toStageId: 'initial_review' }],
      [8, 'system', 'assign', 'Submitted', { toStageId: 'initial_review', toUserId: 'u-sc' }],
      [7, 'u-sc', 'start_review', 'Under Review', { fromStatus: 'Submitted', fromStageId: 'initial_review', toStageId: 'initial_review', toUserId: 'u-sc' }],
    ]),
  }),
  // Returned for information, then resubmitted (revision 2)
  app({
    id: 'a-007', ref: 'APP-2026-0302', companyName: 'Bahrain Fragrance Hub', legalName: 'Bahrain Fragrance Hub W.L.L.', crNumber: 'BH-CR-128844', taxNumber: 'VAT 220018844100002',
    country: 'Bahrain', city: 'Manama', territoryId: 't-gcc', businessType: 'Retail chain', annualVolumeBand: 'USD 500k – 1M',
    contact: { name: 'Ali Al-Khalifa', role: 'Owner', email: 'ali@bahrainfragrance.example', phone: '+973 1755 0122' },
    requestedBrandIds: ['b-oud', 'b-noire'],
    billingAddress: addr('Seef District, Building 2102', 'Manama', 'Bahrain'),
    deliveryAddress: addr('Bahrain Logistics Zone, Unit 18', 'Hidd', 'Bahrain'),
    documents: [
      ...docs([['CR_BahrainFH.pdf', 'Commercial Registration', 450], ['VAT_BahrainFH.pdf', 'Tax Certificate', 160]], 12),
      ...docs([['Store_List_and_Footprint.pdf', 'Trade License', 520]], 0.8, 2),
    ],
    status: 'Resubmitted', applicantUserId: 'u-app6', createdAt: ago(12, 4), submittedAt: ago(12), updatedAt: ago(0, 19), revision: 2,
    currentStageId: 'initial_review', assignedToUserId: 'u-sc', stageEnteredAt: ago(0, 19),
    history: history('a-007', [
      [12, 'u-app6', 'submit', 'Submitted', { toStageId: 'initial_review' }],
      [12, 'system', 'assign', 'Submitted', { toStageId: 'initial_review', toUserId: 'u-sc' }],
      [11, 'u-sc', 'start_review', 'Under Review', { fromStatus: 'Submitted', fromStageId: 'initial_review', toStageId: 'initial_review', toUserId: 'u-sc' }],
      [3, 'u-sc', 'return_to_requester', 'Returned for Information', {
        fromStatus: 'Under Review', fromStageId: 'initial_review', toUserId: 'u-app6',
        publicRemarks: 'Please confirm the number of retail outlets and upload your store list. Also correct the delivery address — Hidd warehouse is outside the Manama business licence area.',
        remarks: 'Need store count to check against Pearl Coast channel in Bahrain.',
      }],
      [0.8, 'u-app6', 'resubmit', 'Resubmitted', { fromStatus: 'Returned for Information', toStageId: 'initial_review', revision: 2, publicRemarks: 'Uploaded store list (9 outlets). Delivery address is our licensed bonded warehouse — licence copy included in the store list file.' }],
      [0.8, 'system', 'assign', 'Resubmitted', { toStageId: 'initial_review', toUserId: 'u-sc', revision: 2 }],
    ]),
  }),
  // Newly submitted
  app({
    id: 'a-008', ref: 'APP-2026-0299', companyName: 'KL Essence', legalName: 'KL Essence Sdn Bhd', crNumber: 'MY 201901044812', taxNumber: 'SST W10-1808-32000412',
    country: 'Malaysia', city: 'Kuala Lumpur', territoryId: 't-sea', businessType: 'Specialist perfumery', annualVolumeBand: 'USD 100k – 500k',
    contact: { name: 'Siti Rahman', role: 'Director', email: 'siti@klessence.example', phone: '+60 3 5555 0119' },
    requestedBrandIds: ['b-oud', 'b-velour', 'b-aurelle'],
    billingAddress: addr('Menara KLCC Annexe, Level 12', 'Kuala Lumpur', 'Malaysia', '50088'),
    deliveryAddress: addr('Port Klang Free Zone, Lot 33', 'Port Klang', 'Malaysia', '42920'),
    documents: docs([['SSM_Profile_KLEssence.pdf', 'Commercial Registration', 430], ['SST_Registration.pdf', 'Tax Certificate', 140]], 14),
    status: 'Submitted', applicantUserId: 'u-app7', createdAt: ago(1, 6), submittedAt: ago(1), updatedAt: ago(1), revision: 1,
    currentStageId: 'initial_review', assignedToUserId: 'u-sc', stageEnteredAt: ago(1),
    history: history('a-008', [
      [1, 'u-app7', 'submit', 'Submitted', { toStageId: 'initial_review' }],
      [1, 'system', 'assign', 'Submitted', { toStageId: 'initial_review', toUserId: 'u-sc' }],
    ]),
  }),
]

// Bahrain Fragrance Hub — keep revision 1 snapshot (before correction) plus revision 2.
const bfh = applications.find((a) => a.id === 'a-007')!
bfh.revisions = [
  { revision: 1, submittedAt: ago(12), content: { ...structuredClone(bfh.revisions[0]!.content), deliveryAddress: addr('Industrial Area, Warehouse 4', 'Hidd', 'Bahrain') } },
  { revision: 2, submittedAt: ago(0.8), content: structuredClone(bfh.revisions[0]!.content) },
]
