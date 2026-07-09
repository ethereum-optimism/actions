import { useEffect, useRef, useCallback } from 'react'
import {
  dispatchEarnPositionsChanged,
  EARN_POSITIONS_CHANGED_EVENT,
} from '@/utils/earnSync'
import type { Address } from 'viem'
import type {
  BorrowReceipt,
  LendMarket,
  LendMarketId,
  LendMarketPosition,
  LendTransactionReceipt,
  SupportedChainId,
  SwapMarket,
  SwapQuote,
  Asset,
} from '@eth-optimism/actions-sdk/react'
import { useQueryClient } from '@tanstack/react-query'
import { useMarketData } from '@/hooks/useMarketData'
import { useWalletBalance } from '@/hooks/useWalletBalance'
import { useActivityLogger } from '@/hooks/useActivityLogger'
import { convertLendMarketToMarketInfo } from '@/utils/marketConversion'
import type { LendExecutePositionParams } from '@/types/api'
import type { TokenBalance } from '@eth-optimism/actions-sdk/react'
import type { BorrowOperations } from '@/hooks/useBorrowProvider'
import { getBlockExplorerUrl, extractHashes } from '@/utils/blockExplorer'
import type { MarketInfo } from '@/components/earn/MarketSelector'
import type { MarketPosition } from '@/types/market'

/**
 * Find the position whose market matches `marketId` (case-insensitive on the
 * address). `getPositions` returns one entry per configured market, so this is
 * how a market view-model is reunited with its on-chain balance.
 */
function findPosition(
  positions: LendMarketPosition[],
  marketId: { address: string; chainId: number },
): LendMarketPosition | undefined {
  return positions.find(
    (p) =>
      p.marketId.address.toLowerCase() === marketId.address.toLowerCase() &&
      p.marketId.chainId === marketId.chainId,
  )
}

/**
 * Build the `MarketPosition` view-model from a market and its on-chain
 * position. Shared by the mount-time load and the post-trade refresh so both
 * render identical shapes from a single `getPositions` call.
 */
function toMarketPosition(
  market: MarketInfo,
  position: LendMarketPosition,
): MarketPosition {
  return {
    marketName: market.name,
    marketLogo: market.logo,
    networkName: market.networkName,
    networkLogo: market.networkLogo,
    asset: market.asset,
    assetLogo: market.assetLogo,
    apy: market.apy,
    depositedAmount: position.balanceFormatted,
    directDepositedAmount: position.balanceFormatted,
    depositedShares: position.sharesFormatted,
    depositedSharesRaw: position.shares,
    directDepositedShares: position.sharesFormatted,
    directDepositedSharesRaw: position.shares,
    pledgedCollateralAmount: null,
    isLoadingApy: false,
    isLoadingPosition: false,
    marketId: market.marketId,
    provider: market.provider,
  }
}

/** Seed the per-market position cache so single-market queries don't re-fetch. */
function seedPositionCache(
  queryClient: ReturnType<typeof useQueryClient>,
  positions: LendMarketPosition[],
): void {
  for (const position of positions) {
    queryClient.setQueryData(
      ['position', position.marketId.address, position.marketId.chainId],
      position,
    )
  }
}

/** Join configured markets to their positions, keeping only funded markets. */
function buildFundedPositions(
  markets: MarketInfo[],
  positions: LendMarketPosition[],
): MarketPosition[] {
  return markets
    .map((market) => ({
      market,
      position: findPosition(positions, market.marketId),
    }))
    .filter(
      (entry): entry is { market: MarketInfo; position: LendMarketPosition } =>
        entry.position !== undefined && entry.position.balance > 0n,
    )
    .map((entry) => toMarketPosition(entry.market, entry.position))
}

/**
 * Operations interface for wallet interactions
 * This abstraction allows both frontend and server wallet implementations
 */
export interface EarnOperations {
  getTokenBalances: () => Promise<TokenBalance[]>
  getMarkets: () => Promise<LendMarket[]>
  getPosition: (marketId: LendMarketId) => Promise<LendMarketPosition>
  getPositions: (params?: {
    chainId?: SupportedChainId
    nonZeroOnly?: boolean
  }) => Promise<LendMarketPosition[]>
  mintAsset: (asset: Asset) => Promise<{ blockExplorerUrls?: string[] } | void>
  openPosition: (
    params: LendExecutePositionParams,
  ) => Promise<LendTransactionReceipt>
  closePosition: (
    params: LendExecutePositionParams,
  ) => Promise<LendTransactionReceipt>
  executeSwap: (quote: SwapQuote) => Promise<{ blockExplorerUrl?: string }>
  getConfiguredAssets: () => Promise<Asset[]>
  getSwapMarkets: () => Promise<SwapMarket[]>
  getSwapQuote: (params: {
    tokenInAddress: Address
    tokenOutAddress: Address
    chainId: SupportedChainId
    amountIn?: number
    amountOut?: number
    provider?: string
  }) => Promise<SwapQuote | null>
}

interface UseLendProviderParams {
  operations: EarnOperations
  ready: boolean
  borrowOperations?: BorrowOperations
  walletAddress?: Address | null
  logPrefix?: string
}

/**
 * Shared hook for lend provider data management
 * Handles market fetching, position tracking, and wallet balance operations
 */
export function useLendProvider({
  operations,
  ready,
  borrowOperations,
  walletAddress,
  logPrefix = '[useLendProvider]',
}: UseLendProviderParams) {
  const hasLoadedMarkets = useRef(false)
  const queryClient = useQueryClient()
  const { logActivity } = useActivityLogger()

  // Market selection state management
  const {
    markets,
    setMarkets,
    marketPositions,
    setMarketPositions,
    selectedMarket,
    setSelectedMarket,
    isLoadingMarkets,
    setIsLoadingMarkets,
    handleMarketSelect,
  } = useMarketData()

  const isReady = useCallback(() => ready, [ready])

  const refreshAllPositions = useCallback(async () => {
    if (!ready || markets.length === 0) return
    // One SDK call aggregates every market/provider position (see #14),
    // replacing the per-market getPosition fan-out. Kept best-effort: the
    // event-driven caller invokes this as `void`, so a refresh failure must
    // log rather than surface as an unhandled rejection (the old per-market
    // fan-out swallowed errors the same way).
    try {
      const positions = await operations.getPositions()
      seedPositionCache(queryClient, positions)
      setMarketPositions(buildFundedPositions(markets, positions))
    } catch (error) {
      console.error('Error refreshing positions:', error)
    }
  }, [markets, operations, queryClient, ready, setMarketPositions])

  // Fetch available markets on mount
  useEffect(() => {
    const fetchMarkets = async () => {
      // Prevent duplicate fetches (e.g., from React Strict Mode)
      if (hasLoadedMarkets.current) {
        return
      }
      hasLoadedMarkets.current = true

      try {
        setIsLoadingMarkets(true)

        // Log and fetch markets
        const marketActivity = logActivity('getMarket')
        const rawMarkets = await operations.getMarkets()
        marketActivity?.confirm()

        // Seed markets cache so useMarkets query doesn't re-fetch
        queryClient.setQueryData(['markets'], rawMarkets)

        const marketInfoList = rawMarkets.map(convertLendMarketToMarketInfo)
        setMarkets(marketInfoList)

        // One SDK call aggregates every market/provider position (see #14),
        // replacing the per-market getPosition fan-out. The single activity-log
        // entry is now honest: one call, one log line.
        const positionActivity = logActivity('getPosition')
        const positions = await operations.getPositions()
        positionActivity?.confirm()

        // Seed position cache for each market so useMarketPosition doesn't re-fetch
        seedPositionCache(queryClient, positions)

        // Build initial market positions array with all markets that have deposits
        setMarketPositions(buildFundedPositions(marketInfoList, positions))

        // Set default selected market (first one, preferably Morpho/USDC)
        if (marketInfoList.length > 0 && !selectedMarket) {
          const defaultMarket =
            marketInfoList.find((m) => m.name === 'Morpho') || marketInfoList[0]

          // Reuse the position we already fetched for this market
          const defaultPosition = findPosition(
            positions,
            defaultMarket.marketId,
          )

          setSelectedMarket({
            marketName: defaultMarket.name,
            marketLogo: defaultMarket.logo,
            networkName: defaultMarket.networkName,
            networkLogo: defaultMarket.networkLogo,
            asset: defaultMarket.asset,
            assetLogo: defaultMarket.assetLogo,
            apy: defaultMarket.apy,
            depositedAmount: defaultPosition?.balanceFormatted || null,
            directDepositedAmount: defaultPosition?.balanceFormatted || null,
            depositedShares: defaultPosition?.sharesFormatted || null,
            depositedSharesRaw: defaultPosition?.shares || null,
            directDepositedShares: defaultPosition?.sharesFormatted || null,
            directDepositedSharesRaw: defaultPosition?.shares || null,
            pledgedCollateralAmount: null,
            isLoadingApy: false,
            isLoadingPosition: false,
            marketId: defaultMarket.marketId,
            provider: defaultMarket.provider,
          })
        }
      } catch (error) {
        console.error('Error fetching markets:', error)
        hasLoadedMarkets.current = false // Reset on error to allow retry
      } finally {
        setIsLoadingMarkets(false)
      }
    }

    if (ready) {
      fetchMarkets()
    }
  }, [
    ready,
    operations,
    logPrefix,
    logActivity,
    queryClient,
    setMarkets,
    setMarketPositions,
    selectedMarket,
    setSelectedMarket,
    setIsLoadingMarkets,
  ])

  // Use wallet balance hook for balance and transaction handling
  const {
    assetBalance,
    isLoadingBalance,
    isMintingAsset,
    handleMintAsset,
    isLoadingApy,
    apy,
    isInitialLoad,
    isLoadingPosition,
    depositedAmount,
    depositedShares,
    depositedSharesRaw,
    handleTransaction: handleTransactionBase,
  } = useWalletBalance({
    getTokenBalances: operations.getTokenBalances,
    getMarkets: operations.getMarkets,
    getPosition: operations.getPosition,
    mintAsset: operations.mintAsset,
    openPosition: operations.openPosition,
    closePosition: operations.closePosition,
    isReady,
    selectedMarketId: selectedMarket?.marketId as
      | LendMarketId
      | null
      | undefined,
    selectedAsset: selectedMarket?.asset,
    selectedMarketApy: selectedMarket?.apy,
  })

  // Update marketPositions when selected market's position changes
  useEffect(() => {
    if (!selectedMarket) return
    // Only update if we have actual position data (not initial/loading state)
    if (depositedAmount === null) return

    setMarketPositions((prev) => {
      const existingIndex = prev.findIndex(
        (p) =>
          p.marketId.address.toLowerCase() ===
            selectedMarket.marketId.address.toLowerCase() &&
          p.marketId.chainId === selectedMarket.marketId.chainId,
      )

      const updatedMarket = {
        ...selectedMarket,
        depositedAmount,
        directDepositedAmount: depositedAmount,
        depositedShares,
        depositedSharesRaw,
        directDepositedShares: depositedShares,
        directDepositedSharesRaw: depositedSharesRaw,
        pledgedCollateralAmount: null,
        apy,
      }

      // Check if this is a meaningful update
      const hasDeposit =
        depositedAmount &&
        depositedAmount !== '0' &&
        depositedAmount !== '0.00' &&
        parseFloat(depositedAmount) > 0

      if (existingIndex >= 0) {
        const existing = prev[existingIndex]
        // Only update if the deposited amount or APY actually changed
        if (
          existing.depositedAmount === depositedAmount &&
          existing.depositedShares === depositedShares &&
          existing.depositedSharesRaw === depositedSharesRaw &&
          existing.apy === apy
        ) {
          return prev // No change, return same reference to prevent re-render
        }

        // If deposited amount is now 0, remove from list
        if (!hasDeposit) {
          return prev.filter((_, i) => i !== existingIndex)
        }

        // Update existing market
        const newPositions = [...prev]
        newPositions[existingIndex] = updatedMarket
        return newPositions
      } else if (hasDeposit) {
        // Only add new market if it has a deposit
        return [...prev, updatedMarket]
      }

      return prev // No change needed
    })
  }, [
    selectedMarket,
    depositedAmount,
    depositedShares,
    depositedSharesRaw,
    apy,
    setMarketPositions,
  ])

  useEffect(() => {
    const handlePositionsChanged = () => {
      void refreshAllPositions()
    }
    window.addEventListener(
      EARN_POSITIONS_CHANGED_EVENT,
      handlePositionsChanged,
    )
    return () => {
      window.removeEventListener(
        EARN_POSITIONS_CHANGED_EVENT,
        handlePositionsChanged,
      )
    }
  }, [refreshAllPositions])

  const handleTransaction = useCallback(
    async (
      mode: 'lend' | 'withdraw',
      amount: number,
      options?: {
        releaseCollateral?: {
          marketId: Parameters<
            BorrowOperations['withdrawCollateral']
          >[1]['marketId']
          amountRaw: bigint
        }
      },
    ) => {
      if (
        mode !== 'withdraw' ||
        !options?.releaseCollateral ||
        !borrowOperations ||
        !walletAddress
      ) {
        return handleTransactionBase(mode, amount)
      }

      if (!selectedMarket) {
        throw new Error('No market selected')
      }

      const activity = logActivity('withdraw', {
        amount: amount.toString(),
        assetSymbol: selectedMarket.asset.metadata.symbol,
        marketName: selectedMarket.marketName,
        chainId: selectedMarket.marketId.chainId,
      })

      try {
        // Two sequential txs; batching into a single sendBatch is tracked in #427.
        const collateralReceipt: BorrowReceipt =
          await borrowOperations.withdrawCollateral(walletAddress, {
            marketId: options.releaseCollateral.marketId,
            amount: { amountRaw: options.releaseCollateral.amountRaw },
          })
        const lendReceipt = await operations.closePosition({
          marketId: selectedMarket.marketId as LendMarketId,
          amount,
          asset: selectedMarket.asset,
          marketName: selectedMarket.marketName.toLowerCase(),
        })

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['tokenBalances'] }),
          queryClient.invalidateQueries({
            queryKey: [
              'position',
              selectedMarket.marketId.address,
              selectedMarket.marketId.chainId,
            ],
          }),
        ])
        await refreshAllPositions()
        dispatchEarnPositionsChanged()

        const blockExplorerUrl =
          getBlockExplorerUrl(selectedMarket.marketId.chainId, lendReceipt) ||
          getBlockExplorerUrl(
            options.releaseCollateral.marketId.chainId,
            collateralReceipt,
          )
        activity?.confirm({ blockExplorerUrl })

        const { txHash, userOpHash } = extractHashes(lendReceipt)
        return {
          transactionHash: txHash || userOpHash,
          blockExplorerUrl,
        }
      } catch (error) {
        activity?.error()
        throw error
      }
    },
    [
      borrowOperations,
      handleTransactionBase,
      logActivity,
      operations,
      queryClient,
      refreshAllPositions,
      selectedMarket,
      walletAddress,
    ],
  )

  return {
    // Market data
    markets,
    selectedMarket,
    setSelectedMarket,
    handleMarketSelect,
    isLoadingMarkets,
    marketPositions,
    setMarketPositions,
    // Balance data
    assetBalance,
    isLoadingBalance,
    isMintingAsset,
    apy,
    isLoadingApy,
    depositedAmount,
    isLoadingPosition,
    isInitialLoad: isInitialLoad || isLoadingMarkets,
    // Actions
    handleMintAsset,
    handleTransaction,
  }
}
