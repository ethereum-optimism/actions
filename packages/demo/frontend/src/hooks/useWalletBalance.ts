import { useMemo, useEffect, useRef } from 'react'
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
import { getBlockExplorerUrls } from '@/utils/blockExplorer'

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
    if (!tokenBalances || !marketData || !selectedAsset) return '0.00'

    return matchAssetBalance({
      allTokenBalances: tokenBalances,
      selectedAssetSymbol: selectedAsset.metadata.symbol,
      marketData,
    })
  }, [tokenBalances, marketData, selectedAsset])

  // Track balance before lend/withdraw to ensure we don't show stale data
  const balanceBeforeLend = useRef<string | null>(null)

  // Reset mutation states and clear balance tracking when balance actually changes
  useEffect(() => {
    const balanceChanged =
      balanceBeforeLend.current !== null &&
      assetBalance !== balanceBeforeLend.current

    if (!isFetchingBalances && balanceChanged) {
      balanceBeforeLend.current = null
      if (openPositionMutation.isSuccess) {
        openPositionMutation.reset()
      }
      if (closePositionMutation.isSuccess) {
        closePositionMutation.reset()
      }
    }

    // Reset mint mutation when not fetching (mint doesn't need balance comparison)
    if (!isFetchingBalances && mintAssetMutation.isSuccess) {
      mintAssetMutation.reset()
    }
  }, [
    isFetchingBalances,
    assetBalance,
    mintAssetMutation,
    openPositionMutation,
    closePositionMutation,
  ])

  // Handler functions
  const handleMintAsset = async () => {
    if (!selectedAsset) return
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

    // Track balance before transaction to ensure we show loading until it changes
    balanceBeforeLend.current = assetBalance

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
    const userOpHash = 'userOpHash' in result ? result.userOpHash : undefined
    const txHash = Array.isArray(result)
      ? result[0]?.transactionHash
      : 'receipt' in result
        ? result.receipt.transactionHash
        : result.transactionHash

    // Construct block explorer URL from chain and hash
    const explorerUrls = await getBlockExplorerUrls(
      marketData.marketId.chainId,
      txHash ? [txHash] : undefined,
      userOpHash,
    )

    return {
      transactionHash: txHash || userOpHash,
      blockExplorerUrl: explorerUrls[0],
    }
  }

  // Show loading while mutations are pending OR while refetching after a successful mutation
  const isMutationRefetching =
    (mintAssetMutation.isSuccess ||
      openPositionMutation.isSuccess ||
      closePositionMutation.isSuccess) &&
    isFetchingBalances

  // For lend/withdraw: also show loading until balance actually changes from pre-transaction value
  const isWaitingForBalanceChange =
    balanceBeforeLend.current !== null &&
    assetBalance === balanceBeforeLend.current

  const isLoadingBalance =
    isLoadingBalances ||
    isLoadingMarkets ||
    !marketData ||
    mintAssetMutation.isPending ||
    openPositionMutation.isPending ||
    closePositionMutation.isPending ||
    isMutationRefetching ||
    isWaitingForBalanceChange

  const isLoadingApy = isLoadingMarkets || isFetchingMarkets
  const isLoadingPositionState =
    isLoadingPosition ||
    isFetchingPosition ||
    openPositionMutation.isPending ||
    closePositionMutation.isPending

  // Track minting state: true while mint is in progress OR refetching after mint success
  const isMintingAsset =
    mintAssetMutation.isPending ||
    (mintAssetMutation.isSuccess && isFetchingBalances)

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
