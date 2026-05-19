import { createContext, useContext, type ReactNode } from 'react'
import type { Address } from 'viem'
import {
  useBorrowProvider,
  type BorrowOperations,
  type UseBorrowProviderReturn,
} from '@/hooks/useBorrowProvider'

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
  return (
    <BorrowProviderContext.Provider value={value}>
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
