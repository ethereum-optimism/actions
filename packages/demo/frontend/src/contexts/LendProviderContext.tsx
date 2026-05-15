import { createContext, useContext, type ReactNode } from 'react'
import type { Address } from 'viem'
import type { MarketInfo } from '@/components/earn/MarketSelector'
import type { MarketPosition } from '@/types/market'
import { useLendProvider, type EarnOperations } from '@/hooks/useLendProvider'
import type { BorrowOperations } from '@/hooks/useBorrowProvider'

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
  isMintingAsset: boolean
  // Position data
  depositedAmount: string | null
  isLoadingPosition: boolean
  isInitialLoad: boolean
  // Actions
  handleMintAsset: () => void
  handleTransaction: (
    mode: 'lend' | 'withdraw',
    amount: number,
    options?: {
      releaseCollateral?: {
        marketId: {
          kind: 'morpho-blue'
          marketId: string
          chainId: number
        }
        amountRaw: bigint
      }
    },
  ) => Promise<{ transactionHash?: string; blockExplorerUrl?: string }>
}

const LendProviderContext = createContext<LendProviderContextValue | null>(null)

interface LendProviderContextProviderProps {
  children: ReactNode
  operations: EarnOperations
  ready: boolean
  borrowOperations?: BorrowOperations
  walletAddress?: Address | null
  logPrefix?: string
}

export function LendProviderContextProvider({
  children,
  operations,
  ready,
  borrowOperations,
  walletAddress,
  logPrefix,
}: LendProviderContextProviderProps) {
  const lendData = useLendProvider({
    operations,
    ready,
    borrowOperations,
    walletAddress,
    logPrefix,
  })

  const value: LendProviderContextValue = {
    markets: lendData.markets,
    selectedMarket: lendData.selectedMarket,
    handleMarketSelect: lendData.handleMarketSelect,
    isLoadingMarkets: lendData.isLoadingMarkets,
    marketPositions: lendData.marketPositions,
    assetBalance: lendData.assetBalance,
    isLoadingBalance: lendData.isLoadingBalance,
    isMintingAsset: lendData.isMintingAsset,
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
