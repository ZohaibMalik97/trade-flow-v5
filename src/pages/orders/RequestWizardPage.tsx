import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Gift,
  Info,
  Loader2,
  PackagePlus,
  Plus,
  Save,
  Send,
  Trash2,
  Truck,
  Warehouse,
} from 'lucide-react'
import { approverIdFor, requestTotal, rulesForValue, useLookups, useStore, type RequestDraftInput } from '@/app/store'
import { useScope } from '@/hooks/useScope'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, DemoTag, StatusBadge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { Avatar, EmptyState, Notice, QuantityStepper } from '@/components/ui/misc'
import { SelectField, TextareaField, TextField } from '@/components/forms/Field'
import { FilterSelect, SearchInput } from '@/components/data-display/FilterBar'
import { ProductImage } from '@/components/data-display/ProductImage'
import { StockSourceNote } from '@/components/data-display/StockSourceNote'
import { useToast } from '@/components/ui/Toast'
import { services, type PriceAvailability } from '@/services'
import { brands, CATEGORIES } from '@/data/reference'
import { WAREHOUSES } from '@/data/reference'
import { warehouseFor } from '@/data/reference'
import { calculatePromo, nextPromoThreshold } from '@/utils/promo'
import { fromUsd, roundMoney, toUsd } from '@/utils/fx'
import { date, money, num } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { Address, FulfilmentMode, OrderLine } from '@/types/domain'

const STEPS = ['Customer', 'Products', 'Quantities', 'Summary & allocations', 'Fulfilment', 'Review & submit'] as const

interface Line {
  productId: string
  quantity: number
}

const fulfilmentSchema = z
  .object({
    fulfilment: z.enum(['Delivery', 'Collection']),
    requestedDate: z.string().min(1, 'Choose a requested date'),
    warehouse: z.string(),
    line1: z.string(),
    city: z.string(),
    customerPo: z.string().max(40, 'Keep the PO under 40 characters').optional(),
  })
  .superRefine((v, ctx) => {
    const min = new Date()
    min.setDate(min.getDate() + 7)
    min.setHours(0, 0, 0, 0)
    if (v.requestedDate && new Date(v.requestedDate) < min) ctx.addIssue({ code: 'custom', path: ['requestedDate'], message: 'Requested date must be at least 7 days ahead' })
    if (v.fulfilment === 'Delivery') {
      if (v.line1.trim().length < 4) ctx.addIssue({ code: 'custom', path: ['line1'], message: 'Enter the delivery address' })
      if (v.city.trim().length < 2) ctx.addIssue({ code: 'custom', path: ['city'], message: 'Enter the delivery city' })
    }
  })

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

export default function RequestWizardPage() {
  const { state, user, can, saveDraft, submitRequest } = useStore()
  /** Customer users order for their own account; staff with create_on_behalf pick a customer. */
  const ownAccountOnly = !can('order.create_on_behalf')
  const scope = useScope()
  const lookups = useLookups()
  const toast = useToast()
  const [params] = useSearchParams()
  const source = state.requests.find((r) => r.id === params.get('from') && ['Draft', 'Returned for Clarification'].includes(r.status))

  const [step, setStep] = useState(source ? 2 : ownAccountOnly ? 1 : 0)
  const [draftId, setDraftId] = useState<string | undefined>(source?.id)
  const [customerId, setCustomerId] = useState<string>(source?.customerId ?? (ownAccountOnly ? user.customerId! : params.get('customer') ?? ''))
  const [lines, setLines] = useState<Line[]>(source ? source.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })) : state.cart.map((c) => ({ ...c })))
  const [prices, setPrices] = useState<Record<string, PriceAvailability>>({})
  const [checking, setChecking] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const submitKey = useRef(crypto.randomUUID())
  const [done, setDone] = useState<{ id: string; ref: string }>()
  const [productQuery, setProductQuery] = useState('')
  const [productCategory, setProductCategory] = useState('')

  const customer = state.customers.find((c) => c.id === customerId)
  const defaultDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 21)
    return isoDay(d)
  })()
  const [ful, setFul] = useState({
    fulfilment: (source?.fulfilment ?? 'Collection') as FulfilmentMode,
    requestedDate: source ? source.requestedDate.slice(0, 10) : defaultDate,
    warehouse: source?.collectionWarehouse ?? '',
    line1: source?.deliveryAddress?.line1 ?? '',
    city: source?.deliveryAddress?.city ?? '',
    customerPo: source?.customerPo ?? '',
    notes: source?.notes ?? '',
  })

  // Prefill fulfilment defaults when the customer changes.
  useEffect(() => {
    if (!customer) return
    setFul((f) => ({
      ...f,
      warehouse: f.warehouse || warehouseFor(customer.territoryId),
      line1: f.line1 || customer.deliveryAddress.line1,
      city: f.city || customer.deliveryAddress.city,
    }))
  }, [customer])

  // Simulated price & availability check via the service layer when quantities are reviewed.
  useEffect(() => {
    if (step !== 2 || !customer || lines.length === 0) return
    let cancelled = false
    setChecking(true)
    services.catalog
      .getPriceAndAvailability(lines.map((l) => l.productId), customer.id)
      .then((res) => !cancelled && setPrices(Object.fromEntries(res.map((r) => [r.productId, r]))))
      .finally(() => !cancelled && setChecking(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, customer?.id, lines.length])

  const allowedBrandIds = useMemo(() => {
    if (!customer) return [] as string[]
    const t = state.territories.find((x) => x.id === customer.territoryId)
    return customer.brandIds.filter((b) => t?.visibleBrandIds.includes(b))
  }, [customer, state.territories])

  const currency = customer?.currency ?? 'USD'
  const product = (id: string) => state.products.find((p) => p.id === id)!
  const unitPrice = (id: string) => prices[id]?.unitPrice ?? roundMoney(fromUsd(product(id).unitPriceUsd, currency))
  const orderLines: OrderLine[] = lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: unitPrice(l.productId) }))
  const subtotal = requestTotal({ lines: orderLines })
  const promo = calculatePromo(orderLines, state.products, state.promoRules)
  const rule = rulesForValue(state.approvalRules, toUsd(subtotal, currency))
  const disallowed = lines.filter((l) => !allowedBrandIds.includes(product(l.productId).brandId))

  const lineIssues = (l: Line): { level: 'error' | 'warning'; text: string } | undefined => {
    const p = product(l.productId)
    if (l.quantity <= 0) return { level: 'error', text: 'Quantity must be greater than zero' }
    if (p.stockStatus === 'Out of Stock') return { level: 'error', text: 'Out of stock — remove this line' }
    if (l.quantity % p.casePack !== 0) return { level: 'error', text: `Order in multiples of ${p.casePack} (case pack)` }
    if (p.stockStatus === 'Pre-order') return { level: 'warning', text: 'Pre-order — allocation confirmed after approval' }
    if (l.quantity > p.availableQty) return { level: 'warning', text: `Requested ${num(l.quantity)} exceeds available stock (${num(p.availableQty)} ${p.stockUom}). You can still submit; SAP may only partially confirm.` }
    if (l.quantity > p.availableQty * 0.5) return { level: 'warning', text: 'Large share of available stock — allocation may be reviewed' }
    return undefined
  }

  const validate = (s: number) => {
    const e: Record<string, string> = {}
    if (s === 0 && !customer) e.customer = 'Select a customer account'
    if (s === 0 && customer && customer.status !== 'Active') e.customer = `${customer.name} is ${customer.status.toLowerCase()} and cannot place requests`
    if (s === 1 && lines.length === 0) e.lines = 'Add at least one product'
    if (s === 1 && disallowed.length) e.lines = `${disallowed.length} product(s) are not authorised for this customer — remove them`
    if (s === 2 && lines.some((l) => lineIssues(l)?.level === 'error')) e.lines = 'Fix the highlighted lines before continuing'
    if (s === 4) {
      const res = fulfilmentSchema.safeParse(ful)
      if (!res.success) res.error.issues.forEach((i) => (e[String(i.path[0])] = i.message))
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const go = (to: number) => {
    if (to > step) {
      for (let s = step; s < to; s++) if (!validate(s)) return
    } else setErrors({})
    setStep(to)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const draftInput = (): RequestDraftInput => ({
    id: draftId,
    customerId,
    lines: orderLines,
    fulfilment: ful.fulfilment,
    deliveryAddress: ful.fulfilment === 'Delivery' && customer ? ({ ...customer.deliveryAddress, line1: ful.line1, city: ful.city } as Address) : undefined,
    collectionWarehouse: ful.fulfilment === 'Collection' ? ful.warehouse : undefined,
    requestedDate: new Date(ful.requestedDate).toISOString(),
    customerPo: ful.customerPo || undefined,
    notes: ful.notes || undefined,
  })

  const onSaveDraft = async () => {
    if (!customer) return validate(0)
    const r = await saveDraft(draftInput())
    if (!r.ok) return toast.error('Draft not saved', r.error)
    setDraftId(r.id)
    toast.success('Draft saved', `${r.ref} — find it under Sales requests › Drafts.`)
  }

  const onSubmit = async () => {
    setSubmitting(true)
    try {
      // The same key is reused if the user retries after a network error, so the server never creates a second request.
      const r = await submitRequest(draftInput(), submitKey.current)
      if (!r.ok) return toast.error('Could not submit', r.error)
      setDone({ id: r.id, ref: r.ref })
      setConfirm(false)
      toast.success('Request submitted · Pending approval', r.ref)
    } finally {
      setSubmitting(false)
    }
  }

  if (done)
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-50 text-success-700 ring-8 ring-success-50/50"><Check className="size-7" /></span>
        <h1 className="mt-5 text-xl font-semibold">Request submitted</h1>
        <p className="mt-2"><StatusBadge status="Pending Approval" /></p>
        <p className="mt-2 text-[13px] text-muted">
          <span className="font-mono font-medium text-ink">{done.ref}</span> is now with {lookups.user(approverIdFor(state, rule.stages[0]!, customer!.territoryId))?.name} for {rule.stages[0]} approval. {rule.stages.length > 1 && `${rule.stages.length} approval levels apply for this value.`}
        </p>
        <Notice tone="info" className="mt-5 text-left" title="Saved — not yet sent to SAP">
          The request is stored and waiting for internal approval. The SAP sales order is created only after final approval.
        </Notice>
        <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
          <ButtonLink to={`/app/requests/${done.id}`}>Track request</ButtonLink>
          <ButtonLink to="/app/catalog" variant="secondary">Back to catalog</ButtonLink>
        </div>
      </div>
    )

  const filteredProducts = state.products.filter((p) => allowedBrandIds.includes(p.brandId) && (!productCategory || p.category === productCategory) && (!productQuery || `${p.name} ${p.sku} ${p.description}`.toLowerCase().includes(productQuery.toLowerCase())))

  return (
    <>
      <PageHeader
        title={source ? (source.status === 'Returned for Clarification' ? `Revise ${source.ref}` : `Continue ${source.ref}`) : 'New sales request'}
        breadcrumbs={[{ label: 'Sales Requests', to: '/app/requests' }, { label: source ? source.ref : 'New request' }]}
        actions={step >= 1 && customer && <Button variant="secondary" icon={<Save className="size-4" />} onClick={onSaveDraft}>Save draft</Button>}
      />

      {source?.status === 'Returned for Clarification' && (
        <Notice tone="warning" icon={<AlertCircle className="size-4" />} className="mb-4" title="Changes requested by approver">
          {source.approvalSteps.find((s) => s.status === 'Returned for Clarification')?.comment}
        </Notice>
      )}

      {/* Stepper */}
      <nav aria-label="Request steps" className="card mb-4 overflow-x-auto p-2">
        <ol className="flex min-w-max gap-1">
          {STEPS.map((s, i) => {
            const locked = (i === 0 && ownAccountOnly) || i > step
            return (
              <li key={s} className="flex-1">
                <button
                  type="button"
                  disabled={locked && i > step}
                  onClick={() => (i < step ? go(i) : undefined)}
                  aria-current={i === step ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium',
                    i === step ? 'bg-primary-50 text-primary-700' : i < step ? 'text-ink hover:bg-canvas' : 'text-muted',
                  )}
                >
                  <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-[11px]', i < step ? 'bg-success text-white' : i === step ? 'bg-primary text-white' : 'bg-slate-100')}>
                    {i < step ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className="whitespace-nowrap">{s}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
        <div className="min-w-0">
          {/* 1 Customer */}
          {step === 0 && (
            <Card>
              <CardHeader title="Select customer account" description="Only accounts in your territory scope are listed." />
              <CardBody>
                <ul className="grid gap-3 md:grid-cols-2">
                  {scope.customers.map((c) => {
                    const active = c.id === customerId
                    const blocked = c.status !== 'Active'
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          disabled={blocked}
                          onClick={() => { setCustomerId(c.id); setErrors({}) }}
                          aria-pressed={active}
                          className={cn('flex w-full items-center gap-3 rounded-lg border p-3.5 text-left transition-colors', active ? 'border-primary bg-primary-50/50 ring-1 ring-primary' : 'border-line hover:border-line-strong', blocked && 'cursor-not-allowed opacity-60')}
                        >
                          <Avatar name={c.name} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">{c.name}</span>
                            <span className="block text-xs text-muted">{c.code} · {lookups.territory(c.territoryId)?.name} · {c.currency}</span>
                          </span>
                          {blocked ? <StatusBadge status={c.status} /> : active && <CheckCircle2 className="size-5 text-primary" />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {errors.customer && <p role="alert" className="mt-3 text-xs font-medium text-danger-700">{errors.customer}</p>}
              </CardBody>
            </Card>
          )}

          {/* 2 Products */}
          {step === 1 && customer && (
            <Card>
              <CardHeader title="Browse and select products" description={`${allowedBrandIds.length} brands authorised for ${customer.name}`} actions={<StockSourceNote />} />
              <div className="flex flex-col gap-2 border-b border-line px-5 py-3 sm:flex-row sm:items-center">
                <SearchInput value={productQuery} onChange={setProductQuery} placeholder="Search name, SKU or notes…" className="w-full sm:max-w-sm" />
                <FilterSelect label="Category" value={productCategory} onChange={setProductCategory} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
              </div>
              <ul className="divide-y divide-line">
                {filteredProducts.map((p) => {
                  const selected = lines.some((l) => l.productId === p.id)
                  const brand = brands.find((b) => b.id === p.brandId)!
                  return (
                    <li key={p.id} className="flex items-center gap-4 px-5 py-3">
                      <ProductImage product={p} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{p.name} <span className="font-normal text-muted">· {brand.name}</span></p>
                        <p className="text-xs text-muted"><span className="font-mono">{p.sku}</span> · {p.category} · case {p.casePack}</p>
                        <p className="truncate text-[11px] text-muted" title={p.description}>{p.description}</p>
                      </div>
                      <div className="hidden text-right sm:block">
                        <p className="text-[13px] font-semibold tabular">{money(fromUsd(p.unitPriceUsd, currency), currency)} <span className="text-[11px] font-normal text-muted">/ {p.uom}</span></p>
                        <p className="flex items-center justify-end gap-1.5"><StatusBadge status={p.stockStatus} /><span className="text-[11px] text-muted tabular">{num(p.availableQty)} {p.stockUom}</span></p>
                      </div>
                      <Button
                        size="sm"
                        variant={selected ? 'secondary' : 'primary'}
                        disabled={p.stockStatus === 'Out of Stock' && !selected}
                        icon={selected ? <Check className="size-4" /> : <Plus className="size-4" />}
                        onClick={() => setLines(selected ? lines.filter((l) => l.productId !== p.id) : [...lines, { productId: p.id, quantity: p.casePack * 4 }])}
                        aria-label={selected ? `Remove ${p.name}` : `Add ${p.name}`}
                      >
                        {selected ? 'Added' : 'Add'}
                      </Button>
                    </li>
                  )
                })}
                {filteredProducts.length === 0 && <li><EmptyState icon={<PackagePlus className="size-5" />} title="No matching products" /></li>}
              </ul>
              {errors.lines && <p role="alert" className="border-t border-line px-5 py-3 text-xs font-medium text-danger-700">{errors.lines}</p>}
            </Card>
          )}

          {/* 3 Quantities */}
          {step === 2 && customer && (
            <Card>
              <CardHeader
                title="Enter quantities"
                description="Quantities must follow the case pack."
                actions={checking ? <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Loader2 className="size-3.5 animate-spin" />Checking price & availability (mock)…</span> : <StockSourceNote />}
              />
              {lines.length === 0 ? (
                <EmptyState icon={<PackagePlus className="size-5" />} title="No products selected" action={<Button variant="secondary" onClick={() => go(1)}>Add products</Button>} />
              ) : (
                <ul className="divide-y divide-line">
                  {lines.map((l) => {
                    const p = product(l.productId)
                    const issue = lineIssues(l)
                    return (
                      <li key={l.productId} className="px-5 py-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <ProductImage product={p} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium">{p.name}</p>
                            <p className="text-xs text-muted"><span className="font-mono">{p.sku}</span> · {money(unitPrice(p.id), currency)} / {p.uom} · {num(prices[p.id]?.availableQty ?? p.availableQty)} {p.stockUom} available</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <QuantityStepper value={l.quantity} step={p.casePack} onChange={(v) => setLines(lines.map((x) => (x.productId === l.productId ? { ...x, quantity: v } : x)))} label={`Quantity of ${p.name}`} />
                            <span className="w-28 text-right text-[13px] font-semibold tabular">{money(unitPrice(p.id) * l.quantity, currency)}</span>
                            <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setLines(lines.filter((x) => x.productId !== l.productId))} className="rounded p-1.5 text-muted hover:bg-danger-50 hover:text-danger-700"><Trash2 className="size-4" /></button>
                          </div>
                        </div>
                        {issue && (
                          <p className={cn('mt-2 inline-flex items-center gap-1.5 text-xs font-medium', issue.level === 'error' ? 'text-danger-700' : 'text-warning-700')}>
                            <AlertCircle className="size-3.5" />{issue.text}
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
              {errors.lines && <p role="alert" className="border-t border-line px-5 py-3 text-xs font-medium text-danger-700">{errors.lines}</p>}
            </Card>
          )}

          {/* 4 Summary & allocations */}
          {step === 3 && customer && (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Order summary" description={`${lines.length} line(s) · ${num(lines.reduce((s, l) => s + l.quantity, 0))} units`} />
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead><tr className="border-b border-line bg-canvas/70 text-left text-[11px] uppercase tracking-wide text-muted"><th className="px-5 py-2">Product</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Unit</th><th className="px-5 py-2 text-right">Total</th></tr></thead>
                    <tbody>
                      {orderLines.map((l) => (
                        <tr key={l.productId} className="border-b border-line">
                          <td className="px-5 py-2.5"><span className="flex items-center gap-2.5"><ProductImage product={product(l.productId)} size="xs" /><span><span className="font-medium">{product(l.productId).name}</span> <span className="block font-mono text-[11px] text-muted">{product(l.productId).sku}</span></span></span></td>
                          <td className="px-3 py-2.5 text-right tabular">{num(l.quantity)} <span className="text-[11px] text-muted">{product(l.productId).uom}</span>{l.quantity > product(l.productId).availableQty && <span className="block text-[11px] font-medium text-warning-700">exceeds stock</span>}</td>
                          <td className="px-3 py-2.5 text-right tabular">{money(l.unitPrice, currency)}</td>
                          <td className="px-5 py-2.5 text-right font-medium tabular">{money(l.unitPrice * l.quantity, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr><td colSpan={3} className="px-5 pt-3 text-right text-muted">Subtotal</td><td className="px-5 pt-3 text-right font-medium tabular">{money(subtotal, currency)}</td></tr>
                      <tr><td colSpan={3} className="px-5 py-1 text-right text-muted">Taxes</td><td className="px-5 py-1 text-right text-xs text-muted">Not calculated in portal</td></tr>
                      <tr><td colSpan={3} className="px-5 pb-3 text-right text-muted">Estimated total (excl. tax & freight)</td><td className="px-5 pb-3 text-right text-base font-semibold tabular">{money(subtotal, currency)}</td></tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
              <PromoCard eligible={promo.eligibleUnits} testers={promo.testers} samples={promo.samples} />
              <Card>
                <CardHeader title="Approval route" description={`Rule “${rule.name}” · USD equivalent ${money(toUsd(subtotal, currency), 'USD', { compact: true })} · SLA ${rule.slaHours}h per stage`} />
                <CardBody>
                  <ol className="flex flex-col gap-3 sm:flex-row">
                    {rule.stages.map((s, i) => {
                      const approver = lookups.user(approverIdFor(state, s, customer.territoryId))
                      return (
                        <li key={s} className="flex flex-1 items-center gap-3 rounded-lg border border-line p-3">
                          <span className="flex size-7 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary">{i + 1}</span>
                          <span className="min-w-0">
                            <span className="block text-[13px] font-medium">{s}</span>
                            <span className="block truncate text-xs text-muted">{approver?.name}</span>
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                </CardBody>
              </Card>
            </div>
          )}

          {/* 5 Fulfilment */}
          {step === 4 && customer && (
            <Card>
              <CardHeader title="Delivery or collection" description="Most orders are collected from the regional distribution centre." />
              <CardBody className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Fulfilment mode">
                  {([['Collection', Warehouse, 'Your forwarder collects from our DC (Ex-Works)'], ['Delivery', Truck, 'We arrange freight to your delivery address']] as const).map(([m, Icon, text]) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={ful.fulfilment === m}
                      onClick={() => setFul({ ...ful, fulfilment: m })}
                      className={cn('flex items-start gap-3 rounded-lg border p-4 text-left', ful.fulfilment === m ? 'border-primary bg-primary-50/50 ring-1 ring-primary' : 'border-line hover:border-line-strong')}
                    >
                      <Icon className={cn('mt-0.5 size-5', ful.fulfilment === m ? 'text-primary' : 'text-muted')} />
                      <span>
                        <span className="block text-[13px] font-semibold">{m === 'Collection' ? 'Collection by customer' : 'Delivery'}</span>
                        <span className="block text-xs text-muted">{text}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  {ful.fulfilment === 'Collection' ? (
                    <SelectField label="Collection warehouse" value={ful.warehouse} onChange={(e) => setFul({ ...ful, warehouse: e.target.value })} options={WAREHOUSES.map((w) => ({ value: w, label: w }))} />
                  ) : (
                    <>
                      <TextField label="Delivery address" required value={ful.line1} error={errors.line1} onChange={(e) => setFul({ ...ful, line1: e.target.value })} />
                      <TextField label="City" required value={ful.city} error={errors.city} onChange={(e) => setFul({ ...ful, city: e.target.value })} />
                    </>
                  )}
                  <TextField label="Requested ready date" type="date" required value={ful.requestedDate} min={isoDay(new Date(Date.now() + 7 * 864e5))} error={errors.requestedDate} onChange={(e) => setFul({ ...ful, requestedDate: e.target.value })} />
                  <TextField label="Customer PO reference" placeholder="Optional" value={ful.customerPo} error={errors.customerPo} onChange={(e) => setFul({ ...ful, customerPo: e.target.value })} />
                  <TextareaField className="sm:col-span-2" label="Notes for approvers" placeholder="Campaign context, allocation priorities…" value={ful.notes} onChange={(e) => setFul({ ...ful, notes: e.target.value })} rows={3} />
                </div>
              </CardBody>
            </Card>
          )}

          {/* 6 Review */}
          {step === 5 && customer && (
            <Card>
              <CardHeader title="Review and submit" description="Check everything before sending for approval." icon={<ClipboardCheck className="size-5" />} />
              <CardBody className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <ReviewTile icon={<Building2 className="size-4" />} title="Customer" onEdit={ownAccountOnly ? undefined : () => go(0)}>
                    {customer.name}<br /><span className="text-muted">{customer.code} · {lookups.territory(customer.territoryId)?.name}</span>
                  </ReviewTile>
                  <ReviewTile icon={<Truck className="size-4" />} title="Fulfilment" onEdit={() => go(4)}>
                    {ful.fulfilment === 'Collection' ? `Collection — ${ful.warehouse}` : `Delivery — ${ful.line1}, ${ful.city}`}<br />
                    <span className="text-muted">Ready by {date(new Date(ful.requestedDate).toISOString())}{ful.customerPo && ` · PO ${ful.customerPo}`}</span>
                  </ReviewTile>
                </div>
                <div className="rounded-lg border border-line">
                  <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                    <p className="text-[13px] font-semibold">Lines</p>
                    <button type="button" onClick={() => go(2)} className="text-xs font-medium text-primary hover:underline">Edit</button>
                  </div>
                  <ul className="divide-y divide-line text-[13px]">
                    {orderLines.map((l) => (
                      <li key={l.productId} className="flex justify-between gap-3 px-4 py-2">
                        <span>{num(l.quantity)} × {product(l.productId).name}</span>
                        <span className="font-medium tabular">{money(l.quantity * l.unitPrice, currency)}</span>
                      </li>
                    ))}
                    <li className="flex justify-between gap-3 bg-primary-50/40 px-4 py-2 text-primary-700">
                      <span className="inline-flex items-center gap-1.5"><Gift className="size-3.5" />{promo.testers} testers + {promo.samples} samples (illustrative)</span>
                      <span className="font-medium">Free of charge</span>
                    </li>
                  </ul>
                </div>
                {ful.notes && <Notice tone="info" title="Notes">{ful.notes}</Notice>}
                <Notice tone="demo" icon={<Info className="size-4" />}>Submitting saves the request and starts internal approval. Nothing is sent to SAP until the request is approved and then submitted to SAP.</Notice>
              </CardBody>
            </Card>
          )}

          {/* Footer navigation */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <Button variant="ghost" icon={<ArrowLeft className="size-4" />} disabled={step === 0 || (step === 1 && ownAccountOnly)} onClick={() => go(step - 1)}>Back</Button>
            {step < STEPS.length - 1 ? (
              <Button iconRight={<ArrowRight className="size-4" />} onClick={() => go(step + 1)} disabled={step === 2 && checking}>Continue</Button>
            ) : (
              <Button icon={<Send className="size-4" />} onClick={() => setConfirm(true)}>Submit for approval</Button>
            )}
          </div>
        </div>

        {/* Live summary */}
        <aside className="xl:sticky xl:top-24 xl:h-fit">
          <Card>
            <CardHeader title="Request summary" />
            <CardBody className="space-y-3 text-[13px]">
              <Row label="Customer" value={customer?.name ?? '—'} />
              <Row label="Lines / units" value={`${lines.length} / ${num(lines.reduce((s, l) => s + l.quantity, 0))}`} />
              <Row label="Testers" value={<Badge tone="primary">{promo.testers}</Badge>} />
              <Row label={`Samples (${state.promoRules.sampleSizeMl} ml)`} value={<Badge tone="primary">{promo.samples}</Badge>} />
              <Row label="Approval levels" value={customer ? rule.stages.length : '—'} />
              <div className="border-t border-line pt-3">
                <Row label="Subtotal" value={<span className="text-base font-semibold tabular">{money(subtotal, currency)}</span>} />
              </div>
              {draftId && <p className="text-xs text-muted">Draft saved · {state.requests.find((r) => r.id === draftId)?.ref}</p>}
            </CardBody>
          </Card>
          {!ownAccountOnly && step === 0 && (
            <p className="mt-3 text-xs text-muted">Tip: start from a customer profile to preselect the account. <Link to="/app/customers" className="text-primary hover:underline">Customers</Link></p>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={onSubmit}
        loading={submitting}
        title="Submit request for approval?"
        description={`${money(subtotal, currency)} · ${rule.stages.length} approval level(s): ${rule.stages.join(' → ')}.`}
        confirmLabel="Submit request"
      >
        <p className="text-[13px] text-muted">You can still message the coordinator after submission, but lines can only be changed if an approver requests changes.</p>
      </ConfirmDialog>
    </>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

function ReviewTile({ icon, title, children, onEdit }: { icon: ReactNode; title: string; children: ReactNode; onEdit?: () => void }) {
  return (
    <div className="rounded-lg border border-line p-4 text-[13px]">
      <div className="mb-2 flex items-center justify-between">
        <p className="eyebrow flex items-center gap-1.5">{icon}{title}</p>
        {onEdit && <button type="button" onClick={onEdit} className="text-xs font-medium text-primary hover:underline">Edit</button>}
      </div>
      <p className="font-medium leading-relaxed">{children}</p>
    </div>
  )
}

function PromoCard({ eligible, testers, samples }: { eligible: number; testers: number; samples: number }) {
  const { state } = useStore()
  const r = state.promoRules
  const next = nextPromoThreshold(eligible, r)
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Testers & samples" description="Calculated automatically from eligible fragrance units" icon={<Gift className="size-5 text-primary" />} actions={<DemoTag>Illustrative — policy not confirmed</DemoTag>} />
      <CardBody>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['Eligible units', num(eligible), r.eligibleCategories.join(', ')],
            ['Testers', num(testers), `1 per ${r.testerPerUnits} eligible units`],
            [`Samples (${r.sampleSizeMl} ml)`, num(samples), `${r.samplesPerBlock} per ${r.sampleBlockUnits} eligible units`],
          ].map(([l, v, h]) => (
            <div key={l} className="rounded-lg bg-canvas p-4">
              <p className="text-xs text-muted">{l}</p>
              <p className="mt-1 text-2xl font-semibold tabular">{v}</p>
              <p className="mt-1 text-[11px] text-muted">{h}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          Add {next.toTester} more eligible unit(s) for the next tester, or {next.toSamples} for the next sample block. Rules are configurable under Administration › Workflow Rules (version: {r.version}).
        </p>
      </CardBody>
    </Card>
  )
}
