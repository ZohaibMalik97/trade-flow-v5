import { useSapQuery } from '@/hooks/useSap'
import { services } from '@/services'
import { SapSourceBar, SapState } from '@/components/sap/SapParts'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Building2, FileText, Mail, MessageSquarePlus, Plus, Save, Trash2, UserRound } from 'lucide-react'
import { requestTotal, useLookups, useStore } from '@/app/store'
import { useScope } from '@/hooks/useScope'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { EmptyState, KeyValue, Notice } from '@/components/ui/misc'
import { TextField } from '@/components/forms/Field'
import { DataTable } from '@/components/data-display/DataTable'
import { useToast } from '@/components/ui/Toast'
import { brands } from '@/data/reference'
import { date, money, relative } from '@/utils/format'
import { uid } from '@/utils/time'
import type { Address, Contact, SalesOrderRequest } from '@/types/domain'

type Tab = 'profile' | 'statement' | 'history' | 'inquiries'

/**
 * Customer Portal: the signed-in customer's own account — profile (editable contacts and
 * delivery address), statement and outstanding balance, sales history and inquiries.
 * Only the user's own customer record is ever loaded (customer.view_own + customerId).
 */
export default function CustomerAccountPage() {
  const { state, user, can } = useStore()
  const scope = useScope()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'profile'
  const customer = user.customerId ? scope.customers.find((c) => c.id === user.customerId) : undefined
  const fin = useSapQuery((ctx) => (customer ? services.sapData.getFinancialSummary(ctx, customer.id) : Promise.reject(new Error('No customer account'))), [customer?.id])

  if (!customer)
    return (
      <div className="card">
        <EmptyState icon={<Building2 className="size-5" />} title="No customer account linked" description="Your sign-in is not linked to a customer account yet. If you applied recently, follow the application under My Applications." action={can('application.view_own') ? <ButtonLink to="/app/my-applications">My applications</ButtonLink> : undefined} />
      </div>
    )

  const requests = state.requests.filter((r) => r.customerId === customer.id && (r.status !== 'Draft' || r.createdById === user.id))
  const confirmed = requests.filter((r) => !['Draft', 'Rejected', 'Cancelled', 'Pending Approval', 'Returned for Clarification'].includes(r.status))

  return (
    <>
      <PageHeader
        title={customer.name}
        meta={<><StatusBadge status={customer.status} /><Badge>{customer.code}</Badge></>}
        description="Your customer profile, account statement and sales history."
        breadcrumbs={[{ label: 'My Account' }, { label: 'Business profile' }]}
        actions={<ButtonLink to="/app/requests/new" icon={<Plus className="size-4" />}>Create sales request</ButtonLink>}
      />
      {customer.status !== 'Active' && <Notice tone="warning" className="mb-4" icon={<AlertTriangle className="size-4" />} title={`Account ${customer.status.toLowerCase()}`}>New order requests may be paused. Contact your account manager.</Notice>}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Outstanding balance (SAP)', fin.data ? money(fin.data.totalOutstanding, fin.data.currency) : fin.error ? 'Unavailable' : '…', fin.data ? `${fin.data.openInvoices} open invoice(s) · overdue ${money(fin.data.totalOverdue, fin.data.currency)}` : fin.error?.message ?? 'Reading from SAP'],
          ['Payment terms', customer.paymentTerms, fin.data?.credit ? `Available credit ${money(fin.data.credit.available, fin.data.currency, { compact: true })} (SAP)` : 'Credit information from SAP not shown'],
          ['Confirmed orders', String(confirmed.length), money(confirmed.reduce((s, r) => s + requestTotal(r), 0), customer.currency, { compact: true })],
          ['Open requests', String(requests.filter((r) => ['Pending Approval', 'Returned for Clarification'].includes(r.status)).length), 'In approval or needing changes'],
        ].map(([l, v, h]) => (
          <div key={l} className="card p-4">
            <p className="text-xs text-muted">{l}</p>
            <p className="mt-1 text-lg font-semibold tabular">{v}</p>
            <p className="text-xs text-muted">{h}</p>
          </div>
        ))}
      </div>
      <Card>
        <div className="px-3">
          <Tabs<Tab>
            value={tab}
            onChange={(k) => setParams(k === 'profile' ? {} : { tab: k }, { replace: true })}
            items={[
              { key: 'profile', label: 'Profile' },
              { key: 'statement', label: 'Statement' },
              { key: 'history', label: 'Sales history', count: requests.length },
              { key: 'inquiries', label: 'Inquiries', count: state.threads.filter((t) => t.customerId === customer.id).length },
            ]}
          />
        </div>
        {tab === 'profile' && <ProfileTab />}
        {tab === 'statement' && <StatementTab />}
        {tab === 'history' && <HistoryTab requests={requests} />}
        {tab === 'inquiries' && <InquiriesTab />}
      </Card>
    </>
  )
}

function useOwnCustomer() {
  const { state, user } = useStore()
  return state.customers.find((c) => c.id === user.customerId)!
}

function ProfileTab() {
  const { can, updateOwnProfile } = useStore()
  const lookups = useLookups()
  const toast = useToast()
  const customer = useOwnCustomer()
  const [contacts, setContacts] = useState<Contact[]>(() => structuredClone(customer.contacts))
  const [delivery, setDelivery] = useState<Address>(() => structuredClone(customer.deliveryAddress))
  const [error, setError] = useState<string | null>(null)
  const editable = can('customer.edit_own')
  const dirty = JSON.stringify(contacts) !== JSON.stringify(customer.contacts) || JSON.stringify(delivery) !== JSON.stringify(customer.deliveryAddress)
  const tsm = lookups.user(lookups.territory(customer.territoryId)?.managerId)
  const patch = (i: number, p: Partial<Contact>) => setContacts(contacts.map((c, j) => (j === i ? { ...c, ...p } : p.primary ? { ...c, primary: false } : c)))

  return (
    <div className="grid gap-0 lg:grid-cols-3">
      <div className="space-y-4 p-5 lg:col-span-2 lg:border-r lg:border-line">
        <div>
          <p className="mb-3 text-sm font-semibold">Company</p>
          <KeyValue
            cols={3}
            items={[
              { label: 'Legal name', value: customer.legalName },
              { label: 'Customer code', value: customer.code },
              { label: 'Location', value: `${customer.city}, ${customer.country}` },
              { label: 'Commercial registration', value: <span className="font-mono">{customer.crNumber}</span> },
              { label: 'Tax number', value: <span className="font-mono">{customer.taxNumber}</span> },
              { label: 'Invoice currency', value: customer.currency },
              { label: 'Payment terms', value: customer.paymentTerms },
              { label: 'Customer since', value: date(customer.customerSince) },
              { label: 'Authorised brands', value: customer.brandIds.map((b) => brands.find((x) => x.id === b)?.name).join(', ') },
            ]}
          />
          <p className="mt-2 text-xs text-muted">Legal, tax and commercial terms are maintained by TradeFlow. Send an inquiry to request a change.</p>
        </div>

        <fieldset disabled={!editable} className="space-y-3">
          <legend className="mb-2 text-sm font-semibold">Contacts</legend>
          {contacts.map((c, i) => (
            <div key={c.id} className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-2">
              <TextField label="Name" value={c.name} onChange={(e) => patch(i, { name: e.target.value })} />
              <TextField label="Role" value={c.role} onChange={(e) => patch(i, { role: e.target.value })} />
              <TextField label="Email" type="email" value={c.email} onChange={(e) => patch(i, { email: e.target.value })} />
              <TextField label="Phone" type="tel" value={c.phone} onChange={(e) => patch(i, { phone: e.target.value })} />
              <div className="flex items-center justify-between gap-2 sm:col-span-2">
                <label className="flex items-center gap-1.5 text-xs font-medium"><input type="radio" name="primary" className="accent-primary" checked={!!c.primary} onChange={() => patch(i, { primary: true })} /> Primary contact</label>
                <Button size="sm" variant="ghost" aria-label={`Remove ${c.name || 'contact'}`} icon={<Trash2 className="size-4" />} disabled={contacts.length === 1 || !!c.primary} onClick={() => setContacts(contacts.filter((_, j) => j !== i))}>Remove</Button>
              </div>
            </div>
          ))}
          {editable && <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setContacts([...contacts, { id: uid('ct'), name: '', role: '', email: '', phone: '' }])}>Add contact</Button>}
        </fieldset>

        <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold">Delivery address</legend>
          <TextField label="Street address" value={delivery.line1} onChange={(e) => setDelivery({ ...delivery, line1: e.target.value })} />
          <TextField label="City" value={delivery.city} onChange={(e) => setDelivery({ ...delivery, city: e.target.value })} />
          <TextField label="Postal code" value={delivery.postalCode ?? ''} onChange={(e) => setDelivery({ ...delivery, postalCode: e.target.value })} />
          <TextField label="Country" value={delivery.country} disabled readOnly hint="Country changes are handled by your account manager." />
        </fieldset>

        {error && <p role="alert" className="text-[13px] font-medium text-danger-700">{error}</p>}
        {editable && (
          <div className="flex items-center gap-3">
            <Button
              icon={<Save className="size-4" />}
              disabled={!dirty}
              onClick={async () => {
                const r = await updateOwnProfile({ contacts, deliveryAddress: delivery })
                if (!r.ok) return setError(r.error)
                setError(null)
                toast.success('Profile updated', 'Your account manager has been notified.')
              }}
            >
              Save changes
            </Button>
            {customer.profileUpdatedAt && <span className="text-xs text-muted">Last updated {relative(customer.profileUpdatedAt)}</span>}
          </div>
        )}
      </div>
      <div className="space-y-4 p-5">
        <p className="text-sm font-semibold">Your TradeFlow contacts</p>
        {[
          ['Account Manager', tsm],
          ['Account manager', lookups.user(customer.accountManagerId)],
        ].map(([label, u]) =>
          u && typeof u === 'object' ? (
            <div key={label as string} className="rounded-lg border border-line p-3 text-[13px]">
              <p className="text-xs text-muted">{label as string}</p>
              <p className="font-medium">{u.name}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted"><Mail className="size-3" /> {u.email}</p>
            </div>
          ) : null,
        )}
        <p className="text-xs text-muted">Territory: {lookups.territory(customer.territoryId)?.name}</p>
      </div>
    </div>
  )
}

/** Account statement read from SAP (customer ledger). TradeFlow proformas and payment advice are not part of it. */
function StatementTab() {
  const customer = useOwnCustomer()
  const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
  const q = useSapQuery((ctx) => services.sapData.getLedger(ctx, customer.id, { from, pageSize: 200 }), [customer.id])
  return (
    <div className="space-y-3 p-4">
      <SapState q={q} rows={6}>
        {(l) => (
          <>
            <SapSourceBar mode={l.mode} syncedAt={l.syncedAt} onRefresh={q.reload} loading={q.loading} extra={<span>Last 90 days · SAP account <span className="font-mono">{l.soldTo}</span></span>} />
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[680px] text-[13px]">
                <caption className="sr-only">Account statement</caption>
                <thead>
                  <tr className="border-b border-line bg-canvas/70 text-left text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2">Posting date</th><th className="px-3 py-2">Document</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-line bg-canvas/40"><td className="px-3 py-2" colSpan={5}>Opening balance</td><td className="px-3 py-2 text-right tabular">{money(l.openingBalance, l.currency)}</td></tr>
                  {l.entries.map((e) => (
                    <tr key={e.documentNumber + e.type} className="border-b border-line last:border-0">
                      <td className="px-3 py-1.5">{date(e.postingDate)}</td>
                      <td className="px-3 py-1.5 font-mono text-[12px]">{e.documentNumber}</td>
                      <td className="px-3 py-1.5">{e.type}</td>
                      <td className="px-3 py-1.5 text-right tabular">{e.debit ? money(e.debit, l.currency) : ''}</td>
                      <td className="px-3 py-1.5 text-right tabular">{e.credit ? money(e.credit, l.currency) : ''}</td>
                      <td className="px-3 py-1.5 text-right font-medium tabular">{money(e.balance, l.currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-canvas/70 font-semibold"><td colSpan={5} className="px-3 py-2 text-right">Closing balance</td><td className="px-3 py-2 text-right tabular">{money(l.closingBalance, l.currency)}</td></tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-muted">Full history: <Link className="text-primary hover:underline" to="/app/finance/ledger">Customer ledger</Link> · <Link className="text-primary hover:underline" to="/app/finance/outstanding">Outstanding report</Link> · <Link className="text-primary hover:underline" to="/app/finance/aging">Invoice aging</Link></p>
          </>
        )}
      </SapState>
    </div>
  )
}

function HistoryTab({ requests }: { requests: SalesOrderRequest[] }) {
  const navigate = useNavigate()
  return (
    <DataTable<SalesOrderRequest>
      rows={requests}
      rowKey={(r) => r.id}
      onRowClick={(r) => navigate(`/app/requests/${r.id}`)}
      caption="Sales history"
      initialSort={{ key: 'date', dir: 'desc' }}
      columns={[
        { key: 'ref', header: 'Request', primary: true, sortValue: (r) => r.ref, cell: (r) => <span className="font-mono text-[12px] font-medium">{r.ref}</span> },
        { key: 'date', header: 'Created', sortValue: (r) => r.createdAt, cell: (r) => date(r.createdAt) },
        { key: 'po', header: 'Your PO', hideOnMobile: true, cell: (r) => r.customerPo ?? '—' },
        { key: 'value', header: 'Value', align: 'right', sortValue: (r) => requestTotal(r), cell: (r) => <span className="font-medium tabular">{money(requestTotal(r), r.currency)}</span> },
        { key: 'status', header: 'Status', sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
      ]}
      empty={<EmptyState icon={<FileText className="size-5" />} title="No orders yet" />}
    />
  )
}

function InquiriesTab() {
  const { state } = useStore()
  const customer = useOwnCustomer()
  const threads = state.threads.filter((t) => t.customerId === customer.id)
  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <p className="text-[13px] text-muted">Questions and requests to your TradeFlow team. Replies appear here and in Email Conversations.</p>
        <ButtonLink to={`/app/email?compose=${customer.id}`} size="sm" icon={<MessageSquarePlus className="size-4" />}>New inquiry</ButtonLink>
      </div>
      <ul className="divide-y divide-line">
        {threads.length === 0 && <li><EmptyState icon={<UserRound className="size-5" />} title="No inquiries yet" /></li>}
        {threads.map((t) => (
          <li key={t.id}>
            <Link to={`/app/email?thread=${t.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-canvas">
              <Mail className="size-4 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{t.subject}</span>
                <span className="block text-xs text-muted">{t.messages.length} message(s) · last {relative(t.messages.at(-1)?.sentAt)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
