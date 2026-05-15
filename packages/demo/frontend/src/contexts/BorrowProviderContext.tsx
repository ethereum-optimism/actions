import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Address } from 'viem'
import {
  useBorrowProvider,
  type BorrowOperations,
  type UseBorrowProviderReturn,
} from '@/hooks/useBorrowProvider'

/**
 * Context value mirrors the hook's return shape. Memoized inside the
 * provider so identity is stable across re-renders that don't change
 * the underlying state (avoids cascading re-renders of consumers like
 * `<BorrowHealthCard>` that don't subscribe to all fields).
 */
export type BorrowProviderContextValue = UseBorrowProviderReturn

export const BorrowProviderContext =
  createContext<BorrowProviderContextValue | null>(null)

export function BorrowProviderContextProvider({
  walletAddress,
  operations,
  children,
}: {
  walletAddress: Address | null
  operations: BorrowOperations
  children: ReactNode
}) {
  const value = useBorrowProvider(walletAddress, operations)
  const memoized = useMemo(() => value, [value])
  return (
    <BorrowProviderContext.Provider value={memoized}>
      {children}
    </BorrowProviderContext.Provider>
  )
}

export function useBorrowProviderContext(): BorrowProviderContextValue {
  const ctx = useContext(BorrowProviderContext)
  if (!ctx) {
    throw new Error(
      'useBorrowProviderContext must be used inside <BorrowProviderContextProvider>',
    )
  }
  return ctx
}
