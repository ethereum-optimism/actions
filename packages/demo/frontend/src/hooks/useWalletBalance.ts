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
import { getBlockExplorerUrl, extractHashes } from '@/utils/blockExplorer'
import { useQueryClient } from '@tanstack/react-query'

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

  const queryClient = useQueryClient()
  const { logActivity } = useActivityLogger()

  // Track balance/position before operations to detect when data changes
  const balanceBeforeLend = useRef<string | null>(null)
  const balanceBeforeMint = useRef<string | null>(null)
  const positionBeforeLend = useRef<string | null>(null)
  const initialBalanceFetchDone = useRef(false)

  // Queries
  const {
    data: tokenBalances,
    isLoading: isLoadingBalances,
    isFetching: isFetchingBalances,
  } = useTokenBalances({
    getTokenBalances: getTokenBalancesRaw,
    isReady,
    logActivity,
    shouldLogFetch: () => {
      if (!initialBalanceFetchDone.current) {
        initialBalanceFetchDone.current = true
        return true
      }
      return balanceBeforeMint.current !== null || balanceBeforeLend.current !== null
    },
  })

  const {
    data: markets,
    isLoading: isLoadingMarkets,
    isFetching: isFetchingMarkets,
  } = useMarkets({
    getMarkets: getMarketsRaw,
    isReady,
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
    shouldLogFetch: () => positionBeforeLend.current !== null,
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
      name: market.name.toLowerCase().includes('aave') ? 'Aave' : 'Morpho',
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

  const depositedAmount = position?.balanceFormatted ?? null

  // Reset mutation states and clear tracking refs when data actually changes
  useEffect(() => {
    const lendBalanceChanged =
      balanceBeforeLend.current !== null &&
      assetBalance !== balanceBeforeLend.current

    const mintBalanceChanged =
      balanceBeforeMint.current !== null &&
      assetBalance !== balanceBeforeMint.current

    if (!isFetchingBalances && lendBalanceChanged) {
      balanceBeforeLend.current = null
      if (openPositionMutation.isSuccess) {
        openPositionMutation.reset()
      }
      if (closePositionMutation.isSuccess) {
        closePositionMutation.reset()
      }
    }

    if (!isFetchingBalances && mintBalanceChanged) {
      balanceBeforeMint.current = null
      if (mintAssetMutation.isSuccess) {
        mintAssetMutation.reset()
      }
    }
  }, [
    isFetchingBalances,
    assetBalance,
    mintAssetMutation,
    openPositionMutation,
    closePositionMutation,
  ])

  // Clear position tracking ref when position data changes
  useEffect(() => {
    if (
      positionBeforeLend.current !== null &&
      !isFetchingPosition &&
      depositedAmount !== positionBeforeLend.current
    ) {
      positionBeforeLend.current = null
    }
  }, [isFetchingPosition, depositedAmount])

  // Conditional delayed refetch: only re-invalidate if data hasn't changed yet
  useEffect(() => {
    const needsBalanceRetry =
      !isFetchingBalances &&
      ((balanceBeforeLend.current !== null &&
        assetBalance === balanceBeforeLend.current) ||
        (balanceBeforeMint.current !== null &&
          assetBalance === balanceBeforeMint.current))

    const needsPositionRetry =
      !isFetchingPosition &&
      positionBeforeLend.current !== null &&
      depositedAmount === positionBeforeLend.current

    if (!needsBalanceRetry && !needsPositionRetry) return

    const timer = setTimeout(() => {
      if (needsBalanceRetry) {
        queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
      }
      if (needsPositionRetry && selectedMarketId) {
        queryClient.invalidateQueries({
          queryKey: [
            'position',
            selectedMarketId.address,
            selectedMarketId.chainId,
          ],
        })
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [
    isFetchingBalances,
    isFetchingPosition,
    assetBalance,
    depositedAmount,
    queryClient,
    selectedMarketId,
  ])

  // Handler functions
  const handleMintAsset = async () => {
    if (!selectedAsset) return
    balanceBeforeMint.current = assetBalance
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

    balanceBeforeLend.current = assetBalance
    positionBeforeLend.current = depositedAmount

    const params = {
      marketId: marketData.marketId,
      amount,
      asset: marketData.asset,
      marketName: marketData.name,
    }

    const result =
      mode === 'lend'
        ? await openPositionMutation.mutateAsync(params)
        : await closePositionMutation.mutateAsync(params)

    const { txHash, userOpHash } = extractHashes(result)
    const blockExplorerUrl = getBlockExplorerUrl(
      marketData.marketId.chainId,
      result,
    )

    return {
      transactionHash: txHash || userOpHash,
      blockExplorerUrl,
    }
  }

  // Show loading while mutations are pending OR while refetching after a successful mutation
  const isMutationRefetching =
    (mintAssetMutation.isSuccess ||
      openPositionMutation.isSuccess ||
      closePositionMutation.isSuccess) &&
    isFetchingBalances

  // Show loading until balance actually changes from pre-transaction value
  const isWaitingForLendBalanceChange =
    balanceBeforeLend.current !== null &&
    assetBalance === balanceBeforeLend.current

  const isWaitingForMintBalanceChange =
    balanceBeforeMint.current !== null &&
    assetBalance === balanceBeforeMint.current

  const isLoadingBalance =
    isLoadingBalances ||
    isLoadingMarkets ||
    !marketData ||
    mintAssetMutation.isPending ||
    openPositionMutation.isPending ||
    closePositionMutation.isPending ||
    isMutationRefetching ||
    isWaitingForLendBalanceChange ||
    isWaitingForMintBalanceChange

  const isLoadingApy = isLoadingMarkets || isFetchingMarkets
  const isLoadingPositionState =
    isLoadingPosition ||
    isFetchingPosition ||
    openPositionMutation.isPending ||
    closePositionMutation.isPending

  // Track minting state: true while mint is in progress OR until balance changes
  const isMintingAsset =
    mintAssetMutation.isPending || isWaitingForMintBalanceChange

  return {
    assetBalance,
    isLoadingBalance,
    isMintingAsset,
    handleMintAsset,
    isLoadingApy,
    apy: marketData?.apy ?? null,
    isInitialLoad: isLoadingMarkets,
    isLoadingPosition: isLoadingPositionState,
    depositedAmount,
    handleTransaction,
  }
}
