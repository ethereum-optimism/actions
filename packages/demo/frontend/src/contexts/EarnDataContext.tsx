import { createContext, useContext, type ReactNode } from 'react'
import type { MarketInfo } from '@/components/earn/MarketSelector'
import type { MarketPosition } from '@/types/market'
import { useEarnData, type EarnOperations } from '@/hooks/useEarnData'

interface EarnDataContextValue {
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

const EarnDataContext = createContext<EarnDataContextValue | null>(null)

interface EarnDataProviderProps {
  children: ReactNode
  operations: EarnOperations
  ready: boolean
  logPrefix?: string
}

export function EarnDataProvider({
  children,
  operations,
  ready,
  logPrefix,
}: EarnDataProviderProps) {
  const earnData = useEarnData({ operations, ready, logPrefix })

  const value: EarnDataContextValue = {
    markets: earnData.markets,
    selectedMarket: earnData.selectedMarket,
    handleMarketSelect: earnData.handleMarketSelect,
    isLoadingMarkets: earnData.isLoadingMarkets,
    marketPositions: earnData.marketPositions,
    assetBalance: earnData.assetBalance,
    isLoadingBalance: earnData.isLoadingBalance,
    depositedAmount: earnData.depositedAmount,
    isLoadingPosition: earnData.isLoadingPosition,
    isInitialLoad: earnData.isInitialLoad,
    handleMintAsset: earnData.handleMintAsset,
    handleTransaction: earnData.handleTransaction,
  }

  return (
    <EarnDataContext.Provider value={value}>
      {children}
    </EarnDataContext.Provider>
  )
}

export function useEarnDataContext() {
  const context = useContext(EarnDataContext)
  if (!context) {
    throw new Error('useEarnDataContext must be used within EarnDataProvider')
  }
  return context
}
