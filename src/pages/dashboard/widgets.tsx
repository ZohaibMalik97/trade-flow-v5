import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, Clock } from 'lucide-react'
import type { SalesOrderRequest } from '@/types/domain'
import { Card, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { DemoTag } from '@/components/ui/Badge'
import { useLookups } from '@/app/store'
import { cn } from '@/utils/cn'
import { hoursBetween, money, num, relative } from '@/utils/format'
import { requestTotal } from '@/app/store'

export const CHART = {
  primary: '#635BFF',
  primarySoft: '#C7C4FF',
  teal: '#14B8A6',
  amber: '#F59E0B',
  red: '#EF4444',
  slate: '#94A3B8',
  grid: '#EEF2F7',
}

const tooltipStyle = {
  contentStyle: { borderRadius: 10, border: '1px solid #E2E8F0', boxShadow: '0 8px 24px -12px rgba(15,23,42,.25)', fontSize: 12, padding: '8px 10px' },
  labelStyle: { color: '#64748B', marginBottom: 2 },
  cursor: { fill: 'rgba(99,91,255,0.06)' },
}

export function ChartCard({ title, description, children, action, demo = true, className }: { title: string; description?: string; children: ReactNode; action?: ReactNode; demo?: boolean; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader title={title} description={description} actions={<>{demo && <DemoTag>Illustrative</DemoTag>}{action}</>} />
      <div className="px-2 pb-4 pt-4 sm:px-4">{children}</div>
    </Card>
  )
}

export function TrendArea({ data, valueLabel, currency }: { data: { label: string; value: number }[]; valueLabel: string; currency?: 'USD' }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.22} />
              <stop offset="100%" stopColor={CHART.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
          <YAxis tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v: number) => (currency ? money(v, currency, { compact: true }) : num(v))} />
          <Tooltip {...tooltipStyle} cursor={{ stroke: CHART.primarySoft }} formatter={(v) => [currency ? money(Number(v), currency) : num(Number(v)), valueLabel]} />
          <Area type="monotone" dataKey="value" stroke={CHART.primary} strokeWidth={2} fill="url(#trend-fill)" activeDot={{ r: 4, strokeWidth: 0 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function SimpleBars({ data, valueLabel, currency, color = CHART.primary, horizontal }: { data: { label: string; value: number; color?: string }[]; valueLabel: string; currency?: 'USD'; color?: string; horizontal?: boolean }) {
  const fmt = (v: number) => (currency ? money(v, currency, { compact: true }) : num(v))
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ left: horizontal ? 8 : 4, right: 16, top: 8 }}>
          <CartesianGrid stroke={CHART.grid} vertical={!horizontal ? false : true} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={fmt} />
              <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={120} tick={{ fontSize: 11, fill: '#334155' }} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} interval={0} />
              <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={fmt} allowDecimals={false} />
            </>
          )}
          <Tooltip {...tooltipStyle} formatter={(v) => [currency ? money(Number(v), currency) : num(Number(v)), valueLabel]} />
          <Bar dataKey="value" radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={36}>
            {data.map((d, i) => <Cell key={i} fill={d.color ?? color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Donut({ data, centerLabel, centerValue }: { data: { label: string; value: number; color: string }[]; centerLabel: string; centerValue: string }) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 sm:flex-row">
      <div className="relative h-48 w-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="none">
              {data.map((d) => <Cell key={d.label} fill={d.color} />)}
            </Pie>
            <Tooltip {...tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular">{centerValue}</span>
          <span className="text-[11px] text-muted">{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full space-y-2.5">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2.5 text-[13px]">
            <span className="size-2.5 rounded-sm" style={{ background: d.color }} />
            <span className="flex-1 text-muted">{d.label}</span>
            <span className="font-medium tabular">{num(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Compact request list used on several dashboards. */
export function RequestList({ requests, title, description, to, empty, showSla }: { requests: SalesOrderRequest[]; title: string; description?: string; to: string; empty: string; showSla?: boolean }) {
  const lookups = useLookups()
  return (
    <Card>
      <CardHeader title={title} description={description} actions={<Link to={to} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">View all <ArrowRight className="size-3.5" /></Link>} />
      {requests.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {requests.map((r) => {
            const step = r.approvalSteps.find((s) => s.status === 'Pending')
            const waited = step?.enteredAt ? hoursBetween(step.enteredAt) : 0
            const breached = !!step && waited > step.slaHours
            return (
              <li key={r.id}>
                <Link to={showSla ? `/app/approvals/${r.id}` : `/app/requests/${r.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-canvas">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[13px] font-medium">
                      <span className="font-mono text-[12px]">{r.ref}</span>
                      <span className="truncate text-muted">· {lookups.customer(r.customerId)?.name}</span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                      {showSla && step ? (
                        <span className={cn('inline-flex items-center gap-1', breached ? 'font-medium text-danger-700' : '')}>
                          <Clock className="size-3" /> {step.stage} · waiting {Math.round(waited)}h {breached && '(SLA breached)'}
                        </span>
                      ) : (
                        <>Updated {relative(r.updatedAt)}</>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-semibold tabular">{money(requestTotal(r), r.currency, { compact: true })}</p>
                    <StatusBadge status={r.status} className="mt-1" />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/** Sums values per calendar month for the last 12 months (oldest first). */
export function monthlyTotals<T>(items: T[], dateOf: (x: T) => string | undefined, valueOf: (x: T) => number) {
  const now = new Date()
  const buckets = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-GB', { month: 'short' }), value: 0 }
  })
  const index = new Map(buckets.map((b, i) => [b.key, i]))
  for (const x of items) {
    const iso = dateOf(x)
    if (!iso) continue
    const d = new Date(iso)
    const i = index.get(`${d.getFullYear()}-${d.getMonth()}`)
    if (i !== undefined) buckets[i]!.value += valueOf(x)
  }
  return buckets.map(({ label, value }) => ({ label, value: Math.round(value) }))
}
