import { useMemo, useState, useEffect } from 'react'
import type {
  LendMarket,
  LendMarketId,
  LendMarketPosition,
  LendTransactionReceipt,
  Asset,
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
  mintAsset: (asset: Asset) => Promise<{ blockExplorerUrls?: string[] } | void>
  openPosition: (
    params: LendExecutePositionParams,
  ) => Promise<LendTransactionReceipt>
  closePosition: (
    params: LendExecutePositionParams,
  ) => Promise<LendTransactionReceipt>
  isReady: () => boolean
  selectedMarketId?: LendMarketId | null
  selectedAsset?: Asset
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
    selectedAsset,
    selectedMarketApy,
  } = params

  const { logActivity } = useActivityLogger()

  // Queries
  const { data: tokenBalances, isLoading: isLoadingBalances } =
    useTokenBalances({
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
    if (!tokenBalances || !marketData || !selectedAsset) return '0.00'

    return matchAssetBalance({
      allTokenBalances: tokenBalances,
      selectedAssetSymbol: selectedAsset.metadata.symbol,
      marketData,
    })
  }, [tokenBalances, marketData, selectedAsset])

  // Track balance before mutation - cleared only when balance actually changes
  const [balanceBeforeMutation, setBalanceBeforeMutation] = useState<
    string | null
  >(null)

  const isMutating =
    mintAssetMutation.isPending ||
    openPositionMutation.isPending ||
    closePositionMutation.isPending

  // Clear when balance changes from the pre-mutation value
  useEffect(() => {
    if (
      balanceBeforeMutation !== null &&
      assetBalance !== balanceBeforeMutation
    ) {
      setBalanceBeforeMutation(null)
    }
  }, [assetBalance, balanceBeforeMutation])

  // Fallback: clear loading state after timeout if balance hasn't changed
  // Handles edge cases like on-chain failures that aren't detected client-side
  useEffect(() => {
    if (balanceBeforeMutation === null) return

    const timeout = setTimeout(() => {
      setBalanceBeforeMutation(null)
    }, 5000)

    return () => clearTimeout(timeout)
  }, [balanceBeforeMutation])

  // Handler functions
  const handleMintAsset = async () => {
    if (!selectedAsset) return
    setBalanceBeforeMutation(assetBalance)
    await mintAssetMutation.mutateAsync({
      asset: selectedAsset,
    })
  }

  const handleTransaction = async (
    mode: 'lend' | 'withdraw',
    amount: number,
  ) => {
    if (!marketData) {
      throw new Error('Market data not available')
    }

    setBalanceBeforeMutation(assetBalance)

    const params: LendExecutePositionParams = {
      marketId: marketData.marketId,
      amount,
      asset: marketData.asset,
    }

    let result
    try {
      result =
        mode === 'lend'
          ? await openPositionMutation.mutateAsync(params)
          : await closePositionMutation.mutateAsync(params)
    } catch (error) {
      // Clear loading state on error since balance won't change
      setBalanceBeforeMutation(null)
      throw error
    }

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

  // Show shimmer during load/mutations, or when waiting for balance to update
  const isWaitingForBalanceUpdate = balanceBeforeMutation !== null
  const isLoadingBalance =
    isLoadingBalances ||
    isLoadingMarkets ||
    !marketData ||
    isMutating ||
    isWaitingForBalanceUpdate

  const isLoadingApy = isLoadingMarkets || isFetchingMarkets
  const isLoadingPositionState =
    isLoadingPosition ||
    isFetchingPosition ||
    openPositionMutation.isPending ||
    closePositionMutation.isPending

  // Track minting state: true while mint is in progress (mutation or waiting for balance)
  const isMintingAsset = mintAssetMutation.isPending

  return {
    assetBalance,
    isLoadingBalance,
    isMintingAsset,
    handleMintAsset,
    isLoadingApy,
    apy: marketData?.apy ?? null,
    isInitialLoad: isLoadingMarkets,
    isLoadingPosition: isLoadingPositionState,
    depositedAmount: position?.balanceFormatted ?? null,
    handleTransaction,
  }
}
