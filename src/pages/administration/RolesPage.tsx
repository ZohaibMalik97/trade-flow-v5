import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Copy, KeyRound, Lock, Plus, Save, ShieldCheck, Trash2, Users } from 'lucide-react'
import { useStore } from '@/app/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { Avatar, Notice } from '@/components/ui/misc'
import { SelectField, TextareaField, TextField, Toggle } from '@/components/forms/Field'
import { useToast } from '@/components/ui/Toast'
import { MODULES, PERMISSIONS } from '@/auth/permissions'
import { PROTECTED_ROLE_ID } from '@/auth/roles'
import { cn } from '@/utils/cn'
import type { Role } from '@/types/domain'

/** Role management: create/edit roles, grant permissions, see members. */
export default function RolesPage() {
  const { state, can, createRole, updateRole, deleteRole, setRolePermission } = useStore()
  const toast = useToast()
  const manageRoles = can('role.manage')
  const managePerms = can('permission.manage')
  const [selected, setSelected] = useState(state.roles[0]?.id ?? '')
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const role = state.roles.find((r) => r.id === selected) ?? state.roles[0]
  const [name, setName] = useState(role?.name ?? '')
  const [desc, setDesc] = useState(role?.description ?? '')
  const [lastLoaded, setLastLoaded] = useState(role?.id)
  if (role && role.id !== lastLoaded) {
    setLastLoaded(role.id)
    setName(role.name)
    setDesc(role.description)
  }
  if (!role) return null

  const members = state.users.filter((u) => u.roleIds.includes(role.id))
  const dirty = name !== role.name || desc !== role.description
  const toggle = async (perm: string, on: boolean) => {
    const r = await setRolePermission(role.id, perm, on)
    if (!r.ok) toast.error('Not changed', r.error)
  }

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="Roles group permissions. A user’s access is the union of the permissions of all their roles."
        breadcrumbs={[{ label: 'Administration' }, { label: 'Roles & Permissions' }]}
        actions={manageRoles && <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New role</Button>}
      />
      {!managePerms && <Notice tone="info" className="mb-4" icon={<ShieldCheck className="size-4" />}>Read-only: your role can view roles but not change permissions.</Notice>}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="self-start">
          <ul role="listbox" aria-label="Roles" className="divide-y divide-line">
            {state.roles.map((r) => {
              const n = state.users.filter((u) => u.roleIds.includes(r.id)).length
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={r.id === role.id}
                    onClick={() => setSelected(r.id)}
                    className={cn('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-canvas', r.id === role.id && 'bg-primary-50/60')}
                  >
                    <KeyRound className={cn('mt-0.5 size-4 shrink-0', r.id === role.id ? 'text-primary' : 'text-muted')} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium">{r.name}</span>
                      <span className="block text-xs text-muted">{r.permissions.length} permissions · {n} user{n === 1 ? '' : 's'}</span>
                    </span>
                    {r.system ? <Badge tone="neutral">Built-in</Badge> : <Badge tone="primary">Custom</Badge>}
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader
              title={role.name}
              description={`${role.audience === 'external' ? 'External (customer-side)' : 'Internal'} role · id “${role.id}”`}
              icon={<KeyRound className="size-4" />}
              actions={
                manageRoles &&
                !role.system && (
                  <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
                    Delete
                  </Button>
                )
              }
            />
            <CardBody className="space-y-4">
              <fieldset disabled={!manageRoles} className="grid gap-4 sm:grid-cols-2">
                <TextField label="Role name" value={name} onChange={(e) => setName(e.target.value)} />
                <TextareaField label="Description" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
              </fieldset>
              {manageRoles && (
                <Button
                  size="sm"
                  icon={<Save className="size-4" />}
                  disabled={!dirty}
                  onClick={async () => {
                    const r = await updateRole(role.id, { name, description: desc })
                    if (!r.ok) toast.error('Not saved', r.error)
                    else toast.success('Role updated')
                  }}
                >
                  Save details
                </Button>
              )}
              {role.id === PROTECTED_ROLE_ID && (
                <Notice tone="warning" icon={<Lock className="size-4" />}>Critical administration permissions are locked on this role so administrators can never lock themselves out.</Notice>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Permissions" description="Changes take effect immediately for every user with this role." icon={<ShieldCheck className="size-4" />} />
            <div className="divide-y divide-line">
              {MODULES.map((m) => (
                <div key={m} className="px-5 py-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{m}</p>
                  <ul className="grid gap-x-6 gap-y-2 md:grid-cols-2">
                    {PERMISSIONS.filter((p) => p.module === m).map((p) => {
                      const on = role.permissions.includes(p.id)
                      const locked = role.id === PROTECTED_ROLE_ID && !!p.critical
                      return (
                        <li key={p.id} className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 text-[13px] font-medium">
                              {p.label}
                              {p.critical && <Badge tone="dark">Critical</Badge>}
                              {locked && <Lock className="size-3 text-muted" aria-label="Locked" />}
                            </span>
                            <span className="block text-xs text-muted">{p.description}</span>
                            <code className="text-[10px] text-muted">{p.id}</code>
                          </span>
                          <Toggle label={`${p.label} for ${role.name}`} checked={on} disabled={!managePerms || locked} onChange={(v) => toggle(p.id, v)} />
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Users with this role" description={`${members.length} user(s)`} icon={<Users className="size-4" />} actions={<Link to="/app/admin/users" className="text-[13px] font-medium text-primary hover:underline">Manage users</Link>} />
            <ul className="divide-y divide-line">
              {members.length === 0 && <li className="px-5 py-6 text-center text-[13px] text-muted">No users have this role.</li>}
              {members.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Avatar name={u.name} size="sm" />
                  <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">{u.name}</span><span className="block text-xs text-muted">{u.email}</span></span>
                  <Badge tone={u.active ? 'success' : 'neutral'} dot>{u.active ? 'Active' : 'Inactive'}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {creating && <CreateRoleDialog roles={state.roles} onClose={() => setCreating(false)} onCreate={async (input) => {
        const r = await createRole(input)
        if (!r.ok) return r.error
        toast.success('Role created', 'Assign it to users in Users.')
        setSelected(r.id)
        setCreating(false)
        return null
      }} />}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const r = await deleteRole(role.id)
          setConfirmDelete(false)
          if (!r.ok) return toast.error('Cannot delete role', r.error)
          toast.success('Role deleted')
          setSelected(state.roles[0]!.id)
        }}
        title={`Delete “${role.name}”?`}
        description="Roles that are still assigned to users or used by a workflow stage cannot be deleted."
        confirmLabel="Delete role"
        tone="danger"
      />
    </>
  )
}

function CreateRoleDialog({ roles, onClose, onCreate }: { roles: Role[]; onClose: () => void; onCreate: (input: { name: string; description: string; audience: Role['audience']; permissions: string[] }) => Promise<string | null> }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [audience, setAudience] = useState<Role['audience']>('internal')
  const [copyFrom, setCopyFrom] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog
      open
      onClose={onClose}
      title="New role"
      description="Start empty or copy the permissions of an existing role."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={async () => setError(await onCreate({ name, description, audience, permissions: roles.find((r) => r.id === copyFrom)?.permissions ?? [] }))}>Create role</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-50 px-3 py-2 text-[13px] text-danger-700"><AlertTriangle className="mt-px size-4 shrink-0" />{error}</div>}
        <TextField label="Role name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Compliance Reviewer" />
        <TextareaField label="Description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        <SelectField label="Audience" value={audience} onChange={(e) => setAudience(e.target.value as Role['audience'])} options={[{ value: 'internal', label: 'Internal staff' }, { value: 'external', label: 'External (customer-side)' }]} />
        <SelectField label="Copy permissions from" placeholder="Start with no permissions" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} options={roles.map((r) => ({ value: r.id, label: r.name }))} hint={copyFrom ? <span className="inline-flex items-center gap-1"><Copy className="size-3" /> {roles.find((r) => r.id === copyFrom)?.permissions.length} permissions will be copied</span> : undefined} />
      </div>
    </Dialog>
  )
}
