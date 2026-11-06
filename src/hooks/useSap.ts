import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useScope } from './useScope'
import { useStore } from '@/app/store'
import type { SapAccessContext } from '@/services/contracts'
import { SapServiceError } from '@/types/sap'

/**
 * Access context for SAP reads: the customer accounts the signed-in user may see.
 * Production: the BFF derives this from the server session; here it comes from the same
 * scope rules used everywhere else in the app (customer → own account; staff → territories).
 */
export function useSapAccess(): SapAccessContext {
  const scope = useScope()
  const key = [...scope.customerIds].sort().join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({ customerIds: key ? key.split(',') : [] }), [key])
}

export interface SapQuery<T> {
  data?: T
  error?: { code: string; message: string }
  loading: boolean
  reload: () => void
}

/** Runs an SAP read with loading / error state. Re-runs when `deps` change or `reload()` is called. */
export function useSapQuery<T>(fn: (ctx: SapAccessContext) => Promise<T>, deps: unknown[]): SapQuery<T> {
  const ctx = useSapAccess()
  const { state } = useStore()
  const [tick, setTick] = useState(0)
  const [res, setRes] = useState<{ data?: T; error?: { code: string; message: string }; loading: boolean }>({ loading: true })
  const seq = useRef(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    const id = ++seq.current
    setRes((r) => ({ ...r, loading: true }))
    fnRef.current(ctx)
      .then((data) => id === seq.current && setRes({ data, loading: false }))
      .catch((e: unknown) => {
        if (id !== seq.current) return
        const err = e instanceof SapServiceError ? { code: e.code, message: e.message } : { code: 'ERROR', message: 'The data could not be loaded. Please try again.' }
        setRes({ error: err, loading: false })
      })
    // `state.requests` is included so SAP views refresh after a TradeFlow action (e.g. order creation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, tick, state.requests, state.goodsReceipts, ...deps])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...res, reload }
}

/** Customer account the finance reports are shown for: own account for customers, a picked account for staff. */
export function useAccountSelection() {
  const { user } = useStore()
  const scope = useScope()
  const options = scope.customers
  const [picked, setPicked] = useState<string>(() => {
    try {
      return sessionStorage.getItem('tf-finance-account') ?? ''
    } catch {
      return ''
    }
  })
  const customerId = user.customerId && scope.customerIds.has(user.customerId) ? user.customerId : options.some((c) => c.id === picked) ? picked : options[0]?.id ?? ''
  const pick = (id: string) => {
    setPicked(id)
    try {
      sessionStorage.setItem('tf-finance-account', id)
    } catch {
      /* ignore */
    }
  }
  return { customerId, options, pick, external: user.kind === 'external' }
}
