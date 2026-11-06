import { NavLink } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight, FlaskConical } from 'lucide-react'
import { navigationFor, type NavItem } from '@/config/navigation'
import { useStore } from '@/app/store'
import { SAP_MODE } from '@/services'
import { useScope, useTasks } from '@/hooks/useScope'
import { cn } from '@/utils/cn'
import { Logo } from './Logo'

function useBadgeCounts() {
  const scope = useScope()
  const { state } = useStore()
  const tasks = useTasks()
  return {
    tasks: tasks.length,
    notifications: scope.notifications.filter((n) => !n.read).length,
    approvals: scope.approvalQueue.length,
    email: scope.threads.filter((t) => t.unread).length,
    applications: scope.applicationQueue.length,
    myApplications: scope.myApplications.filter((a) => a.status === 'Returned for Information' || a.status === 'Draft').length,
    // Open receipt discrepancies for staff who resolve them (customer-side pending confirmations need SAP data, shown on the dashboard).
    receipts: scope.can('delivery.resolve_discrepancy') ? state.goodsReceipts.filter((g) => g.discrepancy?.status === 'Open' && scope.customerIds.has(g.customerId)).length : 0,
  }
}

export function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { can } = useStore()
  const counts = useBadgeCounts()
  const sections = navigationFor(can)

  const item = (i: NavItem) => {
    const count = i.badge ? counts[i.badge] : 0
    const Icon = i.icon
    return (
      <li key={i.key}>
        <NavLink
          to={i.to}
          end={i.to === '/app' || i.end}
          onClick={onNavigate}
          title={collapsed ? i.label : undefined}
          className={({ isActive }) =>
            cn(
              'group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
              isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
              collapsed && 'justify-center px-0',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute -left-2.5 top-1.5 bottom-1.5 w-[3px] rounded-r bg-sky-400" aria-hidden />}
              <Icon className={cn('size-4 shrink-0', isActive ? 'text-sky-300' : 'text-slate-500 group-hover:text-slate-300')} />
              {!collapsed && <span className="min-w-0 flex-1 truncate">{i.label}</span>}
              {count > 0 &&
                (collapsed ? (
                  <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-midnight" aria-label={`${count} pending`} />
                ) : (
                  <span className={cn('rounded-full px-1.5 py-px text-[11px] font-semibold tabular', i.badge === 'approvals' || i.badge === 'receipts' || i.badge === 'tasks' || i.badge === 'applications' || i.badge === 'myApplications' ? 'bg-primary text-white' : 'bg-white/10 text-slate-300')}>{count}</span>
                ))}
            </>
          )}
        </NavLink>
      </li>
    )
  }

  return (
    <nav aria-label="Main navigation" className="scroll-thin flex-1 overflow-y-auto px-2.5 py-3">
      {sections.map((s) => (
        <div key={s.title} className="mb-3.5 last:mb-0">
          {!collapsed ? (
            <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{s.title}</p>
          ) : (
            <div className="mx-auto mb-2 h-px w-6 bg-white/10" aria-hidden />
          )}
          <ul className="space-y-0.5">{s.items.map(item)}</ul>
        </div>
      ))}
    </nav>
  )
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col bg-midnight transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[60px]' : 'w-60',
      )}
    >
      <div className={cn('flex h-12 items-center border-b border-white/5', collapsed ? 'justify-center px-2' : 'px-4')}>
        <NavLink to="/app" aria-label="TradeFlow overview">
          <Logo collapsed={collapsed} dark />
        </NavLink>
      </div>
      <SidebarNav collapsed={collapsed} />
      <div className="border-t border-white/5 p-3">
        {!collapsed && (
          <div className="mb-2 flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2.5 text-[11px] leading-snug text-slate-400">
            <FlaskConical className="mt-px size-3.5 shrink-0 text-primary-100" />
            <span>{SAP_MODE === 'mock' ? 'SAP: development mock (server-side) — not connected to SAP.' : 'SAP: live integration.'}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-white', collapsed && 'justify-center')}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> Collapse</>}
        </button>
      </div>
    </aside>
  )
}
