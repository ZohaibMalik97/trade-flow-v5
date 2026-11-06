import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Gift, LayoutGrid, List, PackageSearch, ShoppingCart, Sparkles, Trash2 } from 'lucide-react'
import { useStore } from '@/app/store'
import { useScope } from '@/hooks/useScope'
import { useSimulatedLoading } from '@/hooks/misc'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge, DemoTag, StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState, QuantityStepper, Skeleton } from '@/components/ui/misc'
import { SearchInput, FilterSelect } from '@/components/data-display/FilterBar'
import { ProductImage } from '@/components/data-display/ProductImage'
import { StockSourceNote } from '@/components/data-display/StockSourceNote'
import { DataTable, type Column } from '@/components/data-display/DataTable'
import { useToast } from '@/components/ui/Toast'
import { brands, CATEGORIES } from '@/data/reference'
import { calculatePromo, nextPromoThreshold } from '@/utils/promo'
import { fromUsd } from '@/utils/fx'
import { money, num } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { CurrencyCode, Product } from '@/types/domain'

export default function CatalogPage() {
  const { state, user, addToCart, canAny } = useStore()
  const canRequest = canAny('order.create', 'order.create_on_behalf')
  const scope = useScope()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const loading = useSimulatedLoading(400)
  const [q, setQ] = useState(params.get('q') ?? '')
  const [brandIds, setBrandIds] = useState<string[]>([])
  const [category, setCategory] = useState('')
  const [stock, setStock] = useState('')
  const [view, setView] = useState<'grid' | 'table'>('grid')
  const [qty, setQty] = useState<Record<string, number>>({})

  const customer = user.customerId ? scope.customers.find((c) => c.id === user.customerId) : undefined
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>(customer?.currency ?? 'USD')
  const currency = customer?.currency ?? displayCurrency

  const visibleBrands = useMemo(() => {
    if (!customer) return brands
    const terr = state.territories.find((t) => t.id === customer.territoryId)
    return brands.filter((b) => customer.brandIds.includes(b.id) && terr?.visibleBrandIds.includes(b.id))
  }, [customer, state.territories])

  const products = useMemo(
    () =>
      state.products.filter(
        (p) =>
          visibleBrands.some((b) => b.id === p.brandId) &&
          (!q || `${p.name} ${p.sku} ${p.notes}`.toLowerCase().includes(q.toLowerCase())) &&
          (!brandIds.length || brandIds.includes(p.brandId)) &&
          (!category || p.category === category) &&
          (!stock || p.stockStatus === stock),
      ),
    [state.products, visibleBrands, q, brandIds, category, stock],
  )

  const price = (p: Product) => fromUsd(p.unitPriceUsd, currency)
  const qtyOf = (p: Product) => qty[p.id] ?? p.casePack
  const add = (p: Product) => {
    const n = qtyOf(p)
    if (n <= 0) return
    addToCart(p.id, n)
    toast.success(`${num(n)} × ${p.name} added`, 'Added to your order request draft.')
  }
  const hasFilters = !!(q || brandIds.length || category || stock)
  const inCartQty = (p: Product) => state.cart.find((c) => c.productId === p.id)?.quantity ?? 0
  /** Requested (already in request + this entry) above what is available → warn, do not block. */
  const overStock = (p: Product) => inCartQty(p) + qtyOf(p) > p.availableQty

  const tableCols: Column<Product>[] = [
    {
      key: 'name', header: 'Product', primary: true, sortValue: (p) => p.name,
      cell: (p) => (
        <span className="flex items-center gap-3">
          <ProductImage product={p} size="sm" />
          <span className="min-w-0">
            <span className="block font-medium">{p.name}</span>
            <span className="block font-mono text-[11px] text-muted">{p.sku}</span>
          </span>
        </span>
      ),
    },
    { key: 'brand', header: 'Brand', sortValue: (p) => p.brandId, cell: (p) => brands.find((b) => b.id === p.brandId)?.name },
    { key: 'cat', header: 'Category', hideOnMobile: true, cell: (p) => <span className="text-muted">{p.category} · {p.sizeMl} ml</span> },
    { key: 'price', header: 'Unit price', align: 'right', sortValue: (p) => p.unitPriceUsd, cell: (p) => <span className="font-medium tabular">{money(price(p), currency)}<span className="block text-[11px] font-normal text-muted">per {p.uom}</span></span> },
    { key: 'stock', header: 'Available stock', sortValue: (p) => p.availableQty, cell: (p) => <span className="flex flex-col items-start gap-0.5"><StatusBadge status={p.stockStatus} /><span className="text-[11px] text-muted tabular">{num(p.availableQty)} {p.stockUom}</span></span> },
    ...(!canRequest ? [] : [{
      key: 'add', header: '', align: 'right' as const,
      cell: (p) => (
        <span className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <QuantityStepper size="sm" value={qtyOf(p)} step={p.casePack} onChange={(v) => setQty({ ...qty, [p.id]: v })} label={`Quantity of ${p.name}`} />
          <Button size="sm" disabled={p.stockStatus === 'Out of Stock'} onClick={() => add(p)} aria-label={`Add ${p.name}`}><ShoppingCart className="size-4" /></Button>
        </span>
      ),
    } as Column<Product>]),
  ]

  return (
    <>
      <PageHeader
        title="Product catalog"
        description={customer ? `Brands authorised for ${customer.name} in ${state.territories.find((t) => t.id === customer.territoryId)?.name}. Prices in ${currency}, per sales unit.` : canRequest ? 'All brands and SKUs available for distribution.' : 'Read-only view of products, prices and stock.'}
        breadcrumbs={[{ label: 'Sales' }, { label: 'Product Catalog' }]}
        meta={<StockSourceNote />}
        actions={
          !customer && (
            <label className="flex items-center gap-2 text-[13px] text-muted">
              Price currency
              <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value as CurrencyCode)} className="input h-9 w-24">
                {(['USD', 'EUR', 'GBP', 'AED', 'SAR', 'QAR', 'SGD'] as CurrencyCode[]).map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          )
        }
      />

      <div className={cn('grid gap-4', canRequest && 'xl:grid-cols-[1fr_320px]')}>
        <div className="min-w-0 space-y-4">
          <Card className="p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <SearchInput value={q} onChange={(v) => { setQ(v); setParams(v ? { q: v } : {}) }} placeholder="Search name, SKU or notes…" className="w-full lg:w-72" />
              <FilterSelect label="Category" value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
              <FilterSelect label="Stock" value={stock} onChange={setStock} options={['In Stock', 'Low Stock', 'Pre-order', 'Out of Stock'].map((s) => ({ value: s, label: s }))} />
              <div className="flex-1" />
              <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="View">
                {(['grid', 'table'] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn('rounded-md p-1.5', view === v ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')} aria-label={v === 'grid' ? 'Grid view' : 'Table view'}>
                    {v === 'grid' ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {visibleBrands.map((b) => {
                const on = brandIds.includes(b.id)
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setBrandIds(on ? brandIds.filter((x) => x !== b.id) : [...brandIds, b.id])}
                    className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors', on ? 'border-primary bg-primary-50 text-primary-700' : 'border-line bg-surface text-muted hover:text-ink')}
                  >
                    <span className="size-2 rounded-full" style={{ background: `hsl(${b.hue} 55% 55%)` }} />
                    {b.name}
                  </button>
                )
              })}
              {hasFilters && (
                <button type="button" onClick={() => { setQ(''); setBrandIds([]); setCategory(''); setStock(''); setParams({}) }} className="text-xs font-medium text-primary hover:underline">Clear filters</button>
              )}
            </div>
          </Card>

          <p className="text-xs text-muted">{products.length} product{products.length === 1 ? '' : 's'}</p>

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-80 rounded-lg" />)}
            </div>
          ) : products.length === 0 ? (
            <div className="card"><EmptyState icon={<PackageSearch className="size-5" />} title="No products match" description="Adjust filters or search for a different SKU." /></div>
          ) : view === 'table' ? (
            <Card><DataTable rows={products} columns={tableCols} rowKey={(p) => p.id} pageSize={12} /></Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {products.map((p) => {
                const brand = brands.find((b) => b.id === p.brandId)!
                const inCart = state.cart.find((c) => c.productId === p.id)?.quantity
                return (
                  <li key={p.id} className="card flex flex-col overflow-hidden">
                    <div className="relative">
                      <ProductImage product={p} size="lg" className="rounded-none border-0 border-b" />
                      <div className="absolute left-3 top-3 flex gap-1.5">
                        {p.isNew && <Badge tone="dark"><Sparkles className="size-3" />New</Badge>}
                        {p.category === 'Gift Set' && <Badge tone="warning"><Gift className="size-3" />Gift set</Badge>}
                      </div>
                      {inCart && <span className="absolute right-3 top-3 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">{num(inCart)} in order</span>}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: `hsl(${brand.hue} 50% 40%)` }}>{brand.name}</p>
                      <h3 className="mt-0.5 text-[15px] font-semibold leading-snug">{p.name}</h3>
                      <p className="mt-0.5 font-mono text-[11px] text-muted">{p.sku}</p>
                      <p className="mt-2 line-clamp-2 text-xs text-muted" title={p.description}>{p.description}</p>
                      <div className="mt-3 flex items-end justify-between">
                        <div>
                          <p className="text-lg font-semibold tabular">{money(price(p), currency)}</p>
                          <p className="text-[11px] text-muted">per {p.uom} · case of {p.casePack}</p>
                        </div>
                        <div className="text-right">
                          <StatusBadge status={p.stockStatus} />
                          <p className="mt-1 text-[11px] text-muted tabular">{num(p.availableQty)} {p.stockUom} available</p>
                        </div>
                      </div>
                      {canRequest && overStock(p) && p.stockStatus !== 'Out of Stock' && (
                        <p role="status" className="mt-3 flex items-start gap-1.5 text-[11px] font-medium text-warning-700"><AlertTriangle className="mt-px size-3.5 shrink-0" />Requested quantity exceeds available stock ({num(p.availableQty)} {p.stockUom}). It can still be requested; confirmation depends on SAP availability.</p>
                      )}
                      {canRequest && <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                        <QuantityStepper value={qtyOf(p)} step={p.casePack} onChange={(v) => setQty({ ...qty, [p.id]: v })} label={`Quantity of ${p.name}`} />
                        <Button className="flex-1" disabled={p.stockStatus === 'Out of Stock' || qtyOf(p) === 0} onClick={() => add(p)} icon={<ShoppingCart className="size-4" />}>
                          {p.stockStatus === 'Out of Stock' ? 'Unavailable' : p.stockStatus === 'Pre-order' ? 'Pre-order' : 'Add'}
                        </Button>
                      </div>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        {canRequest && (
          <div className="xl:sticky xl:top-20 xl:h-fit">
            <CartPanel currency={currency} />
          </div>
        )}
      </div>
    </>
  )
}

export function CartPanel({ currency }: { currency: CurrencyCode }) {
  const { state, setCartQty, removeFromCart, clearCart } = useStore()
  const navigate = useNavigate()
  const items = state.cart.map((c) => ({ ...c, product: state.products.find((p) => p.id === c.productId)! }))
  const total = items.reduce((s, i) => s + fromUsd(i.product.unitPriceUsd, currency) * i.quantity, 0)
  const promo = calculatePromo(items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: 0 })), state.products, state.promoRules)
  const next = nextPromoThreshold(promo.eligibleUnits, state.promoRules)

  return (
    <Card>
      <CardHeader title="Order request" description={`${items.length} line(s) · ${num(items.reduce((s, i) => s + i.quantity, 0))} units`} icon={<ShoppingCart className="size-5" />} actions={items.length > 0 && <button type="button" onClick={clearCart} className="text-xs font-medium text-muted hover:text-danger-700">Clear</button>} />
      {items.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-[13px] font-medium">No products yet</p>
          <p className="mt-1 text-xs text-muted">Add products from the catalogue to start a request.</p>
        </div>
      ) : (
        <>
          <ul className="scroll-thin max-h-80 divide-y divide-line overflow-y-auto">
            {items.map((i) => (
              <li key={i.productId} className="flex items-center gap-3 px-5 py-3">
                <ProductImage product={i.product} size="xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{i.product.name}</p>
                  <p className="text-xs text-muted tabular">{num(i.quantity)} {i.product.uom} × {money(fromUsd(i.product.unitPriceUsd, currency), currency)} = {money(fromUsd(i.product.unitPriceUsd, currency) * i.quantity, currency)}</p>
                  {i.quantity > i.product.availableQty && <p className="text-[11px] font-medium text-warning-700">Exceeds available stock ({num(i.product.availableQty)})</p>}
                </div>
                <QuantityStepper size="sm" value={i.quantity} step={i.product.casePack} onChange={(v) => setCartQty(i.productId, v)} label={`Quantity of ${i.product.name}`} />
                <button type="button" aria-label={`Remove ${i.product.name}`} onClick={() => removeFromCart(i.productId)} className="rounded p-1 text-muted hover:text-danger-700"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
          <div className="space-y-3 border-t border-line px-5 py-4">
            <div className="rounded-lg bg-primary-50/60 p-3 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="font-medium text-primary-700">Testers & samples</span>
                <DemoTag>Illustrative</DemoTag>
              </div>
              <p className="mt-1.5 text-ink"><span className="font-semibold tabular">{promo.testers}</span> testers · <span className="font-semibold tabular">{promo.samples}</span> × {state.promoRules.sampleSizeMl} ml samples</p>
              <p className="mt-0.5 text-xs text-muted">{num(promo.eligibleUnits)} eligible units · +{next.toTester} for next tester</p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted">Subtotal · estimated total</span>
              <span className="text-base font-semibold tabular">{money(total, currency)}</span>
            </div>
            <p className="text-[11px] text-muted">Excludes tax and freight — taxes are not calculated by the portal. Final prices are confirmed on the proforma invoice.</p>
            <Button className="w-full" iconRight={<ArrowRight className="size-4" />} onClick={() => navigate('/app/requests/new')}>Continue to request</Button>
          </div>
        </>
      )}
    </Card>
  )
}
