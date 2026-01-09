import { createContext, useContext, type ReactNode } from 'react'
import type { MarketInfo } from '@/components/earn/MarketSelector'
import type { MarketPosition } from '@/types/market'
import {
  useLendProvider,
  type LendProviderOperations,
} from '@/hooks/useLendProvider'

interface LendProviderContextValue {
  // Market data
  markets: MarketInfo[]
  selectedMarket: MarketPosition | null
  handleMarketSelect: (market: MarketInfo) => void
  isLoadingMarkets: boolean
  marketPositions: MarketPosition[]
  // Balance data
  assetBalance: string
  isLoadingBalance: boolean
  // Position data
  depositedAmount: string | null
  isLoadingPosition: boolean
  isInitialLoad: boolean
  // Actions
  handleMintAsset: () => void
  handleTransaction: (
    mode: 'lend' | 'withdraw',
    amount: number,
  ) => Promise<{ transactionHash?: string; blockExplorerUrl?: string }>
}

const LendProviderContext = createContext<LendProviderContextValue | null>(null)

interface LendProviderContextProviderProps {
  children: ReactNode
  operations: LendProviderOperations
  ready: boolean
  logPrefix?: string
}

export function LendProviderContextProvider({
  children,
  operations,
  ready,
  logPrefix,
}: LendProviderContextProviderProps) {
  const lendData = useLendProvider({ operations, ready, logPrefix })

  const value: LendProviderContextValue = {
    markets: lendData.markets,
    selectedMarket: lendData.selectedMarket,
    handleMarketSelect: lendData.handleMarketSelect,
    isLoadingMarkets: lendData.isLoadingMarkets,
    marketPositions: lendData.marketPositions,
    assetBalance: lendData.assetBalance,
    isLoadingBalance: lendData.isLoadingBalance,
    depositedAmount: lendData.depositedAmount,
    isLoadingPosition: lendData.isLoadingPosition,
    isInitialLoad: lendData.isInitialLoad,
    handleMintAsset: lendData.handleMintAsset,
    handleTransaction: lendData.handleTransaction,
  }

  return (
    <LendProviderContext.Provider value={value}>
      {children}
    </LendProviderContext.Provider>
  )
}

export function useLendProviderContext() {
  const context = useContext(LendProviderContext)
  if (!context) {
    throw new Error(
      'useLendProviderContext must be used within LendProviderContextProvider',
    )
  }
  return context
}
