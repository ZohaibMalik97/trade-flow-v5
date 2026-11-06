import { useState } from 'react'
import { Check, Download, Lock, Minus, ShieldCheck } from 'lucide-react'
import { useStore } from '@/app/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/misc'
import { FilterBar, FilterSelect, SearchInput } from '@/components/data-display/FilterBar'
import { Checkbox } from '@/components/forms/Field'
import { useToast } from '@/components/ui/Toast'
import { MODULES, PERMISSIONS, type PermissionDef } from '@/auth/permissions'
import { PROTECTED_ROLE_ID } from '@/auth/roles'
import { cn } from '@/utils/cn'

const ACTIONS: PermissionDef['action'][] = ['View', 'Create', 'Edit', 'Review', 'Approve', 'Reject', 'Return', 'Manage']

/** Roles × permissions grid. Editable for users with permission.manage. */
export default function AuthorizationMatrixPage() {
  const { state, can, setRolePermission } = useStore()
  const toast = useToast()
  const editable = can('permission.manage')
  const [q, setQ] = useState('')
  const [moduleF, setModuleF] = useState('')
  const [actionF, setActionF] = useState('')
  const [audience, setAudience] = useState('')
  const [grantedOnly, setGrantedOnly] = useState(false)

  const roles = state.roles.filter((r) => !audience || r.audience === audience)
  const perms = PERMISSIONS.filter(
    (p) =>
      (!moduleF || p.module === moduleF) &&
      (!actionF || p.action === actionF) &&
      (!q || `${p.label} ${p.id} ${p.description}`.toLowerCase().includes(q.toLowerCase())) &&
      (!grantedOnly || roles.some((r) => r.permissions.includes(p.id))),
  )

  const exportCsv = () => {
    const header = ['Module', 'Action', 'Permission', 'Id', ...roles.map((r) => r.name)]
    const rows = perms.map((p) => [p.module, p.action, p.label, p.id, ...roles.map((r) => (r.permissions.includes(p.id) ? 'Y' : ''))])
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'tradeflow-authorization-matrix.csv' })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader
        title="Authorization matrix"
        description="Which role may do what, by module and action. Each tick is a role → permission grant (role_permissions)."
        breadcrumbs={[{ label: 'Administration' }, { label: 'Authorization Matrix' }]}
        actions={<Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv}>Export CSV</Button>}
      />
      {!editable && <Notice tone="info" className="mb-4" icon={<ShieldCheck className="size-4" />}>Read-only view.</Notice>}
      <Card>
        <FilterBar active={!!(q || moduleF || actionF || audience || grantedOnly)} onReset={() => { setQ(''); setModuleF(''); setActionF(''); setAudience(''); setGrantedOnly(false) }} trailing={<Checkbox label="Granted to a shown role" checked={grantedOnly} onChange={() => setGrantedOnly((v) => !v)} />}>
          <SearchInput value={q} onChange={setQ} placeholder="Search permissions…" label="Search permissions" className="w-full sm:w-56" />
          <FilterSelect label="Module" value={moduleF} onChange={setModuleF} options={MODULES.map((m) => ({ value: m, label: m }))} />
          <FilterSelect label="Action" value={actionF} onChange={setActionF} options={ACTIONS.map((a) => ({ value: a, label: a }))} />
          <FilterSelect label="Roles" value={audience} onChange={setAudience} options={[{ value: 'internal', label: 'Internal roles' }, { value: 'external', label: 'External roles' }]} />
        </FilterBar>
        <div className="scroll-thin max-h-[70vh] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <caption className="sr-only">Authorization matrix: permissions by role</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 top-0 z-20 min-w-64 border-b border-line bg-canvas px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Permission</th>
                {roles.map((r) => (
                  <th key={r.id} scope="col" className="sticky top-0 z-10 min-w-24 border-b border-line bg-canvas px-2 py-3 text-center align-bottom text-[11px] font-semibold text-muted">
                    <span className="block leading-tight">{r.name.replace(/ \(.*\)$/, '')}</span>
                    {r.name.match(/\((.*)\)$/) && <span className="block font-normal">{r.name.match(/\((.*)\)$/)![1]}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.filter((m) => perms.some((p) => p.module === m)).map((m) => (
                <ModuleRows key={m} module={m} perms={perms.filter((p) => p.module === m)} roles={roles} editable={editable} onToggle={async (roleId, perm, on) => { const r = await setRolePermission(roleId, perm, on); if (!r.ok) toast.error('Not changed', r.error) }} />
              ))}
              {perms.length === 0 && (
                <tr><td colSpan={roles.length + 1} className="px-4 py-10 text-center text-muted">No permissions match the filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-3 text-xs text-muted">
          <Lock className="mr-1 inline size-3" /> Locked cells protect critical administration permissions on the System Administrator role. In production these grants live in the server-side authorization service, and every API call is checked against them.
        </p>
      </Card>
    </>
  )
}

function ModuleRows({ module, perms, roles, editable, onToggle }: { module: string; perms: PermissionDef[]; roles: { id: string; name: string; permissions: string[] }[]; editable: boolean; onToggle: (roleId: string, perm: string, on: boolean) => void }) {
  return (
    <>
      <tr>
        <th colSpan={roles.length + 1} scope="colgroup" className="sticky left-0 border-b border-line bg-surface px-4 pb-1.5 pt-4 text-left text-[11px] font-semibold uppercase tracking-wide text-primary">{module}</th>
      </tr>
      {perms.map((p) => (
        <tr key={p.id} className="group">
          <th scope="row" className="sticky left-0 z-10 border-b border-line bg-surface px-4 py-2 text-left font-normal group-hover:bg-canvas">
            <span className="flex items-center gap-1.5 font-medium">{p.label} <Badge tone="neutral" className="!px-1.5 !py-0 text-[10px]">{p.action}</Badge>{p.critical && <Badge tone="dark" className="!px-1.5 !py-0 text-[10px]">Critical</Badge>}</span>
            <code className="text-[10px] text-muted">{p.id}</code>
          </th>
          {roles.map((r) => {
            const on = r.permissions.includes(p.id)
            const locked = r.id === PROTECTED_ROLE_ID && !!p.critical
            const label = `${p.label} — ${r.name}: ${on ? 'granted' : 'not granted'}`
            return (
              <td key={r.id} className="border-b border-line px-2 py-2 text-center group-hover:bg-canvas">
                {editable && !locked ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={label}
                    onClick={() => onToggle(r.id, p.id, !on)}
                    className={cn('mx-auto flex size-6 items-center justify-center rounded-md border transition-colors', on ? 'border-success bg-success-50 text-success-700 hover:bg-success-50/60' : 'border-line text-transparent hover:border-primary/50 hover:text-line-strong')}
                  >
                    <Check className="size-3.5" />
                  </button>
                ) : on ? (
                  <span className="inline-flex items-center gap-0.5" aria-label={label}>{locked && <Lock className="size-3 text-muted" />}<Check className="size-4 text-success" /></span>
                ) : (
                  <Minus className="mx-auto size-4 text-line-strong" aria-label={label} />
                )}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
