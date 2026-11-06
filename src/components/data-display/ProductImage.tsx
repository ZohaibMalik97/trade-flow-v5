import { useState } from 'react'
import type { Product } from '@/types/domain'
import { brands } from '@/data/reference'
import { cn } from '@/utils/cn'
import { ProductVisual } from './ProductVisual'

/**
 * Product image with a fixed aspect ratio.
 * - Uses `product.imageUrl` when the product master provides one.
 * - Falls back to a generated illustration when there is no URL or the image fails to load.
 * The fallback is labelled so it is never mistaken for a real product photo.
 */
export function ProductImage({
  product,
  size = 'md',
  className,
  showFallbackLabel = size === 'lg',
}: {
  product: Pick<Product, 'bottle' | 'name' | 'brandId' | 'imageUrl'>
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  showFallbackLabel?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const hue = brands.find((b) => b.id === product.brandId)?.hue ?? 220
  const box = { xs: 'size-8', sm: 'size-10', md: 'size-12', lg: 'aspect-[4/3] w-full' }[size]
  const useImg = !!product.imageUrl && !failed
  return (
    <div className={cn('relative shrink-0 overflow-hidden rounded-md border border-line bg-canvas', box, className)}>
      {useImg ? (
        <img src={product.imageUrl} alt={product.name} loading="lazy" className="size-full object-contain" onError={() => setFailed(true)} />
      ) : (
        <>
          <ProductVisual product={product} hue={hue} className="size-full" />
          <span className="sr-only">No product image available — illustration shown</span>
          {showFallbackLabel && (
            <span className="absolute bottom-1.5 left-1.5 rounded bg-surface/90 px-1.5 py-0.5 text-[10px] font-medium text-muted" title={failed ? 'The product image could not be loaded' : 'No image in the product master yet'}>
              {failed ? 'Image unavailable' : 'Illustration'}
            </span>
          )}
        </>
      )}
    </div>
  )
}
