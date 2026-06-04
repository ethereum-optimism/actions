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
import { morphoBorrowMarketForVault } from '@/constants/markets'
import type { LendExecutePositionParams } from '@/types/api'
import type { TokenBalance } from '@eth-optimism/actions-sdk/react'
import type { BorrowOperations } from '@/hooks/useBorrowProvider'
import { getBlockExplorerUrl, extractHashes } from '@/utils/blockExplorer'

/**
 * Operations interface for wallet interactions
 * This abstraction allows both frontend and server wallet implementations
 */
export interface EarnOperations {
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
    const results = await Promise.all(
      markets.map(async (market) => {
        try {
          const position = await operations.getPosition({
            address: market.marketId.address as Address,
            chainId: market.marketId.chainId as SupportedChainId,
          })
          queryClient.setQueryData(
            ['position', market.marketId.address, market.marketId.chainId],
            position,
          )
          return { market, position }
        } catch {
          return null
        }
      }),
    )

    setMarketPositions(
      results
        .filter(
          (result): result is NonNullable<typeof result> => result !== null,
        )
        .filter((result) => result.position.balance > 0n)
        .map(({ market, position }) => ({
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
        })),
    )
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

        // Log and fetch positions for all markets in parallel
        const positionActivity = logActivity('getPosition')
        const positionPromises = marketInfoList.map(async (market) => {
          try {
            const position = await operations.getPosition({
              address: market.marketId.address as Address,
              chainId: market.marketId.chainId as SupportedChainId,
            })
            return { market, position }
          } catch (error) {
            console.error(
              `Error fetching position for market ${market.name}:`,
              error,
            )
            return null
          }
        })

        const positionResults = await Promise.all(positionPromises)
        positionActivity?.confirm()

        // Seed position cache for each market so useMarketPosition doesn't re-fetch
        for (const result of positionResults) {
          if (result) {
            queryClient.setQueryData(
              [
                'position',
                result.market.marketId.address,
                result.market.marketId.chainId,
              ],
              result.position,
            )
          }
        }

        // Build initial market positions array with all markets that have deposits
        const initialPositions = positionResults
          .filter((result) => {
            if (!result) return false
            return result.position.balance > 0n
          })
          .map((result) => {
            const { market, position } = result!
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
          })

        setMarketPositions(initialPositions)

        // Set default selected market (first one, preferably Morpho/USDC)
        if (marketInfoList.length > 0 && !selectedMarket) {
          const defaultMarket =
            marketInfoList.find((m) => m.name === 'Morpho') || marketInfoList[0]

          // Find if we already fetched position for this market
          const defaultPosition = positionResults.find(
            (r) =>
              r?.market.marketId.address === defaultMarket.marketId.address,
          )

          setSelectedMarket({
            marketName: defaultMarket.name,
            marketLogo: defaultMarket.logo,
            networkName: defaultMarket.networkName,
            networkLogo: defaultMarket.networkLogo,
            asset: defaultMarket.asset,
            assetLogo: defaultMarket.assetLogo,
            apy: defaultMarket.apy,
            depositedAmount: defaultPosition?.position.balanceFormatted || null,
            directDepositedAmount:
              defaultPosition?.position.balanceFormatted || null,
            depositedShares: defaultPosition?.position.sharesFormatted || null,
            depositedSharesRaw: defaultPosition?.position.shares || null,
            directDepositedShares:
              defaultPosition?.position.sharesFormatted || null,
            directDepositedSharesRaw: defaultPosition?.position.shares || null,
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
      // Lend + chain collateral (Morpho): after depositing into the vault,
      // pledge the resulting shares as borrow collateral so collateral tracks
      // the lend position (like Aave). A failed pledge does not fail the lend —
      // reconciliation retries it on the borrow tab.
      if (
        mode === 'lend' &&
        borrowOperations &&
        walletAddress &&
        selectedMarket
      ) {
        const chainBorrowMarket = morphoBorrowMarketForVault(
          selectedMarket.marketId.address,
          selectedMarket.marketId.chainId,
        )
        if (chainBorrowMarket) {
          const activity = logActivity('lend', {
            amount: amount.toString(),
            assetSymbol: selectedMarket.asset.metadata.symbol,
            marketName: selectedMarket.marketName,
            chainId: selectedMarket.marketId.chainId,
          })
          try {
            const lendReceipt = await operations.openPosition({
              marketId: selectedMarket.marketId as LendMarketId,
              amount,
              asset: selectedMarket.asset,
              marketName: selectedMarket.marketName.toLowerCase(),
            })
            try {
              await borrowOperations.depositCollateral(walletAddress, {
                marketId: {
                  kind: chainBorrowMarket.kind,
                  marketId: chainBorrowMarket.marketId,
                  chainId: chainBorrowMarket.chainId,
                },
                amount: { max: true },
              })
            } catch (collateralError) {
              console.warn(
                'Collateral pledge after lend failed; reconciliation will retry',
                collateralError,
              )
            }
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
            const blockExplorerUrl = getBlockExplorerUrl(
              selectedMarket.marketId.chainId,
              lendReceipt,
            )
            activity?.confirm({ blockExplorerUrl })
            const { txHash, userOpHash } = extractHashes(lendReceipt)
            return { transactionHash: txHash || userOpHash, blockExplorerUrl }
          } catch (error) {
            activity?.error()
            throw error
          }
        }
      }

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
