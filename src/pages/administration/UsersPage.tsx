import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, KeyRound, Pencil, Plus, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { canFor, useLookups, useStore, type UserInput } from '@/app/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Dialog'
import { Avatar, EmptyState, Notice } from '@/components/ui/misc'
import { Checkbox, SelectField, TextField, Toggle } from '@/components/forms/Field'
import { DataTable, type Column } from '@/components/data-display/DataTable'
import { FilterBar, FilterSelect, SearchInput } from '@/components/data-display/FilterBar'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { MODULES, PERMISSIONS } from '@/auth/permissions'
import { permissionsFor } from '@/auth/authorize'
import { PROTECTED_ROLE_ID } from '@/auth/roles'
import { regions } from '@/data/reference'
import { relative } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { DemoUser } from '@/types/domain'

const DEPARTMENTS = ['Sales', 'Sales Operations', 'Commercial', 'Executive', 'Finance', 'Logistics', 'Internal Audit', 'IT']

type DrawerTab = 'profile' | 'permissions' | 'work'
const blank: UserInput = { name: '', email: '', title: '', kind: 'internal', department: '', roleIds: [], territoryIds: [], reviewRegionIds: [], regionId: '', customerId: '', active: true }

export default function UsersPage() {
  const { state, user: me, can, createUser, updateUser, resetUserPassword } = useStore()
  const lookups = useLookups()
  const toast = useToast()
  const manage = can('user.manage')
  const [q, setQ] = useState('')
  const [roleF, setRoleF] = useState('')
  const [statusF, setStatusF] = useState('')
  const [kindF, setKindF] = useState('')
  const [deptF, setDeptF] = useState('')
  const [editing, setEditing] = useState<DemoUser | 'new' | null>(null)
  const [draft, setDraft] = useState<UserInput>(blank)
  const [password, setPassword] = useState('')
  const [tab, setTab] = useState<DrawerTab>('profile')
  const [error, setError] = useState<string | null>(null)

  const users = state.users.filter(
    (u) =>
      u.id !== 'u-system' &&
      (!q || `${u.name} ${u.email} ${u.title}`.toLowerCase().includes(q.toLowerCase())) &&
      (!roleF || u.roleIds.includes(roleF)) &&
      (!statusF || (statusF === 'active' ? u.active : !u.active)) &&
      (!kindF || u.kind === kindF) &&
      (!deptF || u.department === deptF),
  )

  const scopeText = (u: DemoUser) => {
    const parts: string[] = []
    if (u.territoryIds?.length) parts.push(u.territoryIds.map((t) => lookups.territory(t)?.name).join(', '))
    if (u.regionId) parts.push(`${lookups.region(u.regionId)?.name} region`)
    if (u.reviewRegionIds?.length) parts.push(`Reviews ${u.reviewRegionIds.map((r) => lookups.region(r)?.name).join(' & ')}`)
    if (u.customerId) parts.push(lookups.customer(u.customerId)?.name ?? '')
    return parts.join(' · ') || (u.kind === 'external' ? 'Own applications' : '—')
  }

  const open = (u: DemoUser | 'new') => {
    setEditing(u)
    setTab('profile')
    setError(null)
    setPassword('')
    setDraft(
      u === 'new'
        ? blank
        : { name: u.name, email: u.email, title: u.title, kind: u.kind, department: u.department ?? '', roleIds: [...u.roleIds], territoryIds: [...(u.territoryIds ?? [])], reviewRegionIds: [...(u.reviewRegionIds ?? [])], regionId: u.regionId ?? '', customerId: u.customerId ?? '', active: u.active },
    )
  }

  const save = async () => {
    const clean: UserInput = {
      ...draft,
      department: draft.department || undefined,
      regionId: draft.regionId || undefined,
      customerId: draft.customerId || undefined,
      territoryIds: draft.territoryIds?.length ? draft.territoryIds : undefined,
      reviewRegionIds: draft.reviewRegionIds?.length ? draft.reviewRegionIds : undefined,
    }
    if (draft.roleIds.includes('territory_sales_manager') && !clean.territoryIds) return setError('Territory managers need at least one territory assignment.')
    if (draft.roleIds.includes('customer') && !clean.customerId) return setError('Customer users must be linked to a customer account.')
    if (editing === 'new') {
      const r = await createUser(clean, password)
      if (!r.ok) return setError(r.error)
      toast.success('User created', `${clean.name} can sign in with the temporary password and must change it at first sign-in.`)
    } else if (editing) {
      const r = await updateUser(editing.id, clean)
      if (!r.ok) return setError(r.error)
      toast.success('User updated', 'Changes are recorded in the audit trail.')
    }
    setEditing(null)
  }

  const columns: Column<DemoUser>[] = [
    {
      key: 'name', header: 'User', primary: true, sortValue: (u) => u.name,
      cell: (u) => (
        <span className="flex items-center gap-3">
          <Avatar name={u.name} size="sm" />
          <span className="min-w-0"><span className="block font-medium">{u.name}{u.id === me.id && <span className="ml-1 text-xs text-muted">(you)</span>}</span><span className="block truncate text-xs text-muted">{u.email}</span></span>
        </span>
      ),
    },
    {
      key: 'roles', header: 'Roles', sortValue: (u) => u.roleIds.join(','),
      cell: (u) => (
        <span className="flex flex-wrap gap-1">
          {u.roleIds.map((r) => <Badge key={r} tone={r === PROTECTED_ROLE_ID ? 'dark' : lookups.role(r)?.audience === 'external' ? 'info' : 'primary'}>{lookups.role(r)?.name ?? r}</Badge>)}
          {u.roleIds.length === 0 && <span className="text-xs text-muted">None</span>}
        </span>
      ),
    },
    { key: 'dept', header: 'Department', hideOnMobile: true, sortValue: (u) => u.department ?? '', cell: (u) => u.department ?? <span className="text-muted">{u.kind === 'external' ? 'External' : '—'}</span> },
    { key: 'scope', header: 'Assignments', hideOnMobile: true, cell: (u) => <span className="text-muted">{scopeText(u)}</span> },
    { key: 'last', header: 'Last active', hideOnMobile: true, sortValue: (u) => u.lastActiveAt, cell: (u) => relative(u.lastActiveAt) },
    { key: 'status', header: 'Status', sortValue: (u) => (u.active ? 1 : 0), cell: (u) => <Badge tone={u.active ? 'success' : 'neutral'} dot>{u.active ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'edit', header: '', align: 'right',
      cell: (u) => <Button size="xs" variant="ghost" icon={manage ? <Pencil className="size-3.5" /> : <ShieldCheck className="size-3.5" />} onClick={(e) => { e.stopPropagation(); open(u) }}>{manage ? 'Edit' : 'View'}</Button>,
    },
  ]

  const existing = editing && editing !== 'new' ? editing : null
  const effective = useMemo(() => permissionsFor(state.roles, { ...(existing ?? ({} as DemoUser)), roleIds: draft.roleIds, active: true } as DemoUser), [state.roles, draft.roleIds, existing])

  return (
    <>
      <PageHeader
        title="Users"
        description="Accounts, roles and the assignments that decide which records each user can see."
        breadcrumbs={[{ label: 'Administration' }, { label: 'Users' }]}
        actions={manage && <Button icon={<UserPlus className="size-4" />} onClick={() => open('new')}>Add user</Button>}
      />
      {!manage && <Notice tone="info" className="mb-4" icon={<ShieldCheck className="size-4" />}>Read-only: your role can view users but not change them.</Notice>}
      <Card>
        <FilterBar active={!!(q || roleF || statusF || kindF || deptF)} onReset={() => { setQ(''); setRoleF(''); setStatusF(''); setKindF(''); setDeptF('') }}>
          <SearchInput value={q} onChange={setQ} placeholder="Name, email or title…" className="w-full sm:w-64" label="Search users" />
          <FilterSelect label="Role" value={roleF} onChange={setRoleF} options={state.roles.map((r) => ({ value: r.id, label: r.name }))} />
          <FilterSelect label="Department" value={deptF} onChange={setDeptF} options={DEPARTMENTS.map((d) => ({ value: d, label: d }))} />
          <FilterSelect label="Type" value={kindF} onChange={setKindF} options={[{ value: 'internal', label: 'Internal staff' }, { value: 'external', label: 'Customers & applicants' }]} />
          <FilterSelect label="Status" value={statusF} onChange={setStatusF} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        </FilterBar>
        <DataTable rows={users} columns={columns} rowKey={(u) => u.id} onRowClick={(u) => open(u)} initialSort={{ key: 'name', dir: 'asc' }} pageSize={15} caption="Users" empty={<EmptyState icon={<Users className="size-5" />} title="No users match" />} />
      </Card>

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add user' : existing?.name ?? ''}
        description={existing ? existing.email : 'Prototype: the user signs in with the temporary password you set.'}
        footer={
          manage ? (
            <>
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button icon={editing === 'new' ? <Plus className="size-4" /> : undefined} onClick={save}>{editing === 'new' ? 'Create user' : 'Save changes'}</Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setEditing(null)}>Close</Button>
          )
        }
      >
        {editing && (
          <div className="space-y-5">
            <Tabs<DrawerTab>
              value={tab}
              onChange={setTab}
              items={[
                { key: 'profile', label: 'Profile & roles' },
                { key: 'permissions', label: 'Effective permissions', count: effective.size },
                ...(existing ? [{ key: 'work' as const, label: 'Responsibilities' }] : []),
              ]}
            />
            {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-50 px-3 py-2 text-[13px] text-danger-700"><AlertTriangle className="mt-px size-4 shrink-0" />{error}</div>}

            {tab === 'profile' && (
              <fieldset disabled={!manage} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField label="Full name" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  <TextField label="Email (sign-in)" type="email" required value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                  <TextField label="Job title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                  <SelectField label="User type" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as DemoUser['kind'] })} options={[{ value: 'internal', label: 'Internal staff' }, { value: 'external', label: 'External (customer / applicant)' }]} />
                  {draft.kind === 'internal' && <SelectField label="Department" placeholder="—" value={draft.department ?? ''} onChange={(e) => setDraft({ ...draft, department: e.target.value })} options={DEPARTMENTS.map((d) => ({ value: d, label: d }))} />}
                  {editing === 'new' && <TextField label="Temporary password" required type="text" value={password} onChange={(e) => setPassword(e.target.value)} hint="Min. 8 characters with a letter and a number. Prototype only." />}
                </div>

                <fieldset>
                  <legend className="label">Roles <span className="text-danger">*</span></legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {state.roles.filter((r) => r.audience === draft.kind || draft.roleIds.includes(r.id)).map((r) => (
                      <Checkbox
                        key={r.id}
                        label={r.name}
                        description={r.description}
                        checked={draft.roleIds.includes(r.id)}
                        disabled={existing?.id === me.id && r.id === PROTECTED_ROLE_ID}
                        onChange={() => setDraft({ ...draft, roleIds: draft.roleIds.includes(r.id) ? draft.roleIds.filter((x) => x !== r.id) : [...draft.roleIds, r.id] })}
                      />
                    ))}
                  </div>
                  {existing?.id === me.id && <p className="mt-1.5 text-xs text-muted">You cannot remove your own administrator role.</p>}
                </fieldset>

                <div className="space-y-4 rounded-lg border border-line p-4">
                  <p className="text-[13px] font-semibold">Assignments <span className="font-normal text-muted">— decide which records the user sees</span></p>
                  {draft.kind === 'external' ? (
                    <SelectField label="Customer account" placeholder="None (applicant)" value={draft.customerId ?? ''} onChange={(e) => setDraft({ ...draft, customerId: e.target.value })} options={state.customers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))} hint="Customer users only see their own account’s orders, invoices and shipments." />
                  ) : (
                    <>
                      <fieldset>
                        <legend className="label">Territories (Account Managers — customers, approvals, performance)</legend>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {state.territories.map((t) => (
                            <Checkbox key={t.id} label={t.name} checked={draft.territoryIds?.includes(t.id) ?? false} onChange={() => setDraft({ ...draft, territoryIds: draft.territoryIds?.includes(t.id) ? draft.territoryIds.filter((x) => x !== t.id) : [...(draft.territoryIds ?? []), t.id] })} />
                          ))}
                        </div>
                      </fieldset>
                      <SelectField label="Region (optional Regional Manager role)" placeholder="None" value={draft.regionId ?? ''} onChange={(e) => setDraft({ ...draft, regionId: e.target.value })} options={regions.map((r) => ({ value: r.id, label: r.name }))} />
                      <fieldset>
                        <legend className="label">Application review regions (Application / Operations Reviewers)</legend>
                        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                          {regions.map((r) => (
                            <Checkbox key={r.id} label={r.name} checked={draft.reviewRegionIds?.includes(r.id) ?? false} onChange={() => setDraft({ ...draft, reviewRegionIds: draft.reviewRegionIds?.includes(r.id) ? draft.reviewRegionIds.filter((x) => x !== r.id) : [...(draft.reviewRegionIds ?? []), r.id] })} />
                          ))}
                        </div>
                      </fieldset>
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between rounded-lg border border-line p-4">
                  <div><p className="text-[13px] font-medium">Active</p><p className="text-xs text-muted">Inactive users cannot sign in; their history is kept.</p></div>
                  <Toggle label="Active" checked={draft.active} disabled={existing?.id === me.id} onChange={(v) => setDraft({ ...draft, active: v })} />
                </div>

                {existing && manage && <ResetPassword onReset={async (pw) => { const r = await resetUserPassword(existing.id, pw); if (!r.ok) setError(r.error); else toast.success('Password reset', 'Share the new temporary password securely (prototype).') }} />}
              </fieldset>
            )}

            {tab === 'permissions' && (
              <div className="space-y-4">
                <p className="text-xs text-muted">Union of the permissions of the selected roles. Edit role grants in <Link to="/app/admin/roles" className="text-primary hover:underline">Roles & Permissions</Link>.</p>
                {MODULES.map((m) => {
                  const list = PERMISSIONS.filter((p) => p.module === m && effective.has(p.id))
                  if (!list.length) return null
                  return (
                    <div key={m}>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{m}</p>
                      <div className="flex flex-wrap gap-1.5">{list.map((p) => <Badge key={p.id} tone={p.critical ? 'dark' : 'neutral'}><span title={p.description}>{p.label}</span></Badge>)}</div>
                    </div>
                  )
                })}
                {effective.size === 0 && <p className="text-[13px] text-muted">No permissions — the user would see no modules.</p>}
              </div>
            )}

            {tab === 'work' && existing && <Responsibilities user={existing} />}
          </div>
        )}
      </Drawer>
    </>
  )
}

function ResetPassword({ onReset }: { onReset: (pw: string) => void }) {
  const [pw, setPw] = useState('')
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-4 sm:flex-row sm:items-end">
      <TextField label="Reset password" type="text" value={pw} onChange={(e) => setPw(e.target.value)} hint="Prototype — production uses a reset link from the identity provider." className="" />
      <Button variant="secondary" icon={<KeyRound className="size-4" />} disabled={!pw} onClick={() => { onReset(pw); setPw('') }}>Set</Button>
    </div>
  )
}

/** Work currently assigned to the user — useful before deactivating or changing roles. */
function Responsibilities({ user }: { user: DemoUser }) {
  const { state } = useStore()
  const can = canFor(state, user)
  const apps = state.applications.filter((a) => a.assignedToUserId === user.id && !['Approved', 'Rejected'].includes(a.status))
  const own = state.applications.filter((a) => a.applicantUserId === user.id)
  const approvals = state.requests.filter((r) => r.status === 'Pending Approval' && r.approvalSteps.some((s) => s.status === 'Pending' && s.approverId === user.id))
  const managed = state.territories.filter((t) => t.managerId === user.id)
  const row = (to: string, title: string, sub: string, status: string) => (
    <li key={to}><Link to={to} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px] hover:bg-canvas"><span><span className="font-medium">{title}</span> <span className="text-muted">· {sub}</span></span><Badge>{status}</Badge></Link></li>
  )
  return (
    <div className="space-y-4">
      {[
        ['Assigned customer applications', apps.map((a) => row(`/app/applications/${a.id}`, a.ref, a.companyName, a.status))],
        ['Own applications', own.map((a) => row(`/app/applications/${a.id}`, a.ref, a.companyName, a.status))],
        ['Order approvals waiting', approvals.map((r) => row(`/app/approvals/${r.id}`, r.ref, state.customers.find((c) => c.id === r.customerId)?.name ?? '', r.status))],
        ['Territory manager for', managed.map((t) => <li key={t.id} className="px-3 py-2 text-[13px]">{t.name}</li>)],
      ].map(([title, items]) => (
        <div key={title as string}>
          <p className="label">{title as string}</p>
          <ul className={cn('divide-y divide-line rounded-lg border border-line')}>{(items as ReactNode[]).length ? items : <li className="px-3 py-2 text-[13px] text-muted">None</li>}</ul>
        </div>
      ))}
      {!user.active && (apps.length > 0 || approvals.length > 0) && <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>This user is inactive but still has work assigned. Reassign it (e.g. change the territory manager) so nothing is stuck.</Notice>}
      {!can('dashboard.view') && !can('application.view_own') && <p className="text-xs text-muted">This user currently has no modules.</p>}
    </div>
  )
}
