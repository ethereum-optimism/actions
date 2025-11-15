import { useMemo } from 'react'
import type {
  LendMarket,
  LendMarketId,
  LendMarketPosition,
  LendTransactionReceipt,
} from '@eth-optimism/actions-sdk'
import type { TokenBalance } from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'
import type { LendExecutePositionParams } from '@/types/api'
import { useActivityLogger } from './useActivityLogger'
import { useTokenBalances } from '@/queries/useTokenBalances'
import { useMarketPosition } from '@/queries/useMarketPosition'
import { useMarkets } from '@/queries/useMarkets'
import { useMintAsset } from '@/mutations/useMintAsset'
import { useOpenPosition, useClosePosition } from '@/mutations/useLendPosition'
import { matchAssetBalance } from '@/utils/balanceMatching'

export interface UseWalletBalanceConfig {
  getTokenBalances: () => Promise<TokenBalance[]>
  getMarkets: () => Promise<LendMarket[]>
  getPosition: (marketId: LendMarketId) => Promise<LendMarketPosition>
  mintAsset: (assetSymbol: string, chainId: number) => Promise<void>
  openPosition: (
    params: LendExecutePositionParams,
  ) => Promise<LendTransactionReceipt>
  closePosition: (
    params: LendExecutePositionParams,
  ) => Promise<LendTransactionReceipt>
  isReady: () => boolean
  selectedMarketId?: LendMarketId | null
  selectedAssetSymbol?: string
  selectedMarketApy?: number | null
}

export function useWalletBalance(params: UseWalletBalanceConfig) {
  const {
    getTokenBalances: getTokenBalancesRaw,
    getMarkets: getMarketsRaw,
    getPosition: getPositionRaw,
    mintAsset: mintAssetRaw,
    openPosition: openPositionRaw,
    closePosition: closePositionRaw,
    isReady,
    selectedMarketId,
    selectedAssetSymbol = 'USDC',
    selectedMarketApy,
  } = params

  const { logActivity } = useActivityLogger()

  // Queries
  const {
    data: tokenBalances,
    isLoading: isLoadingBalances,
    isFetching: isFetchingBalances,
  } = useTokenBalances({
    getTokenBalances: getTokenBalancesRaw,
    isReady,
    logActivity,
  })

  const {
    data: markets,
    isLoading: isLoadingMarkets,
    isFetching: isFetchingMarkets,
  } = useMarkets({
    getMarkets: getMarketsRaw,
    isReady,
    logActivity,
  })

  const {
    data: position,
    isLoading: isLoadingPosition,
    isFetching: isFetchingPosition,
  } = useMarketPosition({
    marketId: selectedMarketId,
    getPosition: getPositionRaw,
    isReady,
    logActivity,
  })

  // Mutations
  const mintAssetMutation = useMintAsset({
    mintAsset: mintAssetRaw,
    logActivity,
  })

  const openPositionMutation = useOpenPosition({
    openPosition: openPositionRaw,
    logActivity,
  })

  const closePositionMutation = useClosePosition({
    closePosition: closePositionRaw,
    logActivity,
  })

  // Computed market data
  const marketData = useMemo(() => {
    if (!markets || !selectedMarketId) return null

    const market = markets.find(
      (m) =>
        m.marketId.address.toLowerCase() ===
          selectedMarketId.address.toLowerCase() &&
        m.marketId.chainId === selectedMarketId.chainId,
    )

    if (!market) return null

    const assetAddress = (market.asset.address[market.marketId.chainId] ||
      Object.values(market.asset.address)[0]) as Address

    return {
      marketId: market.marketId,
      assetAddress,
      asset: market.asset,
      apy: selectedMarketApy ?? market.apy.total,
    }
  }, [markets, selectedMarketId, selectedMarketApy])

  // Computed balance
  const assetBalance = useMemo(() => {
    if (!tokenBalances || !marketData) return '0.00'

    return matchAssetBalance({
      allTokenBalances: tokenBalances,
      selectedAssetSymbol,
      marketData,
    })
  }, [tokenBalances, marketData, selectedAssetSymbol])

  // Handler functions
  const handleMintAsset = async () => {
    if (!selectedMarketId) return
    await mintAssetMutation.mutateAsync({
      assetSymbol: selectedAssetSymbol,
      chainId: selectedMarketId.chainId,
    })
  }

  const handleTransaction = async (
    mode: 'lend' | 'withdraw',
    amount: number,
  ) => {
    if (!marketData) {
      throw new Error('Market data not available')
    }

    const params: LendExecutePositionParams = {
      marketId: marketData.marketId,
      amount,
      asset: marketData.asset,
    }

    const result =
      mode === 'lend'
        ? await openPositionMutation.mutateAsync(params)
        : await closePositionMutation.mutateAsync(params)

    // Handle union type - result can be EOATransactionReceipt or SmartWalletTransactionReceipt
    const txHash =
      'userOpHash' in result
        ? result.userOpHash
        : Array.isArray(result)
          ? result[0]?.transactionHash
          : result.transactionHash

    const explorerUrl =
      'blockExplorerUrl' in result
        ? result.blockExplorerUrl
        : 'blockExplorerUrls' in result &&
            Array.isArray(result.blockExplorerUrls)
          ? result.blockExplorerUrls[0]
          : undefined

    return {
      transactionHash: txHash,
      blockExplorerUrl: explorerUrl,
    }
  }

  // Loading states - show loading if initial load OR actively mutating
  // IMPORTANT: Also check if marketData is available, since balance calculation depends on it
  const isLoadingBalance =
    isLoadingBalances ||
    isFetchingBalances ||
    isLoadingMarkets ||
    !marketData ||
    mintAssetMutation.isPending

  const isLoadingApy = isLoadingMarkets || isFetchingMarkets
  const isLoadingPositionState =
    isLoadingPosition ||
    isFetchingPosition ||
    openPositionMutation.isPending ||
    closePositionMutation.isPending

  return {
    assetBalance,
    isLoadingBalance,
    handleMintAsset,
    isLoadingApy,
    apy: marketData?.apy ?? null,
    isInitialLoad: isLoadingMarkets,
    isLoadingPosition: isLoadingPositionState,
    depositedAmount: position?.balanceFormatted ?? null,
    handleTransaction,
  }
}
