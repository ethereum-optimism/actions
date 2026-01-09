import { useEffect, useRef, useCallback } from 'react'
import type { Address } from 'viem'
import type {
  LendMarket,
  LendMarketId,
  LendMarketPosition,
  LendTransactionReceipt,
  SupportedChainId,
  Asset,
} from '@eth-optimism/actions-sdk/react'
import { useMarketData } from '@/hooks/useMarketData'
import { useWalletBalance } from '@/hooks/useWalletBalance'
import { convertLendMarketToMarketInfo } from '@/utils/marketConversion'
import type { LendExecutePositionParams } from '@/types/api'
import type { TokenBalance } from '@eth-optimism/actions-sdk/react'

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
}

interface UseEarnDataParams {
  operations: EarnOperations
  ready: boolean
  logPrefix?: string
}

/**
 * Shared hook for Earn page data management
 * Handles market fetching, position tracking, and wallet balance operations
 */
export function useEarnData({
  operations,
  ready,
  logPrefix = '[useEarnData]',
}: UseEarnDataParams) {
  const hasLoadedMarkets = useRef(false)

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

  // Fetch available markets on mount
  useEffect(() => {
    const fetchMarkets = async () => {
      // Prevent duplicate fetches (e.g., from React Strict Mode)
      if (hasLoadedMarkets.current) {
        console.log(`${logPrefix} Markets already loaded, skipping`)
        return
      }
      hasLoadedMarkets.current = true

      try {
        console.log(`${logPrefix} Fetching markets...`)
        setIsLoadingMarkets(true)
        const rawMarkets = await operations.getMarkets()
        const marketInfoList = rawMarkets.map(convertLendMarketToMarketInfo)
        setMarkets(marketInfoList)

        // Fetch positions for all markets in parallel
        console.log(`${logPrefix} Fetching positions for all markets...`)
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
              isLoadingApy: false,
              isLoadingPosition: false,
              marketId: market.marketId,
              provider: market.provider,
            }
          })

        setMarketPositions(initialPositions)
        console.log(
          `${logPrefix} Loaded positions for`,
          initialPositions.length,
          'markets with deposits',
        )

        // Set default selected market (first one, preferably Gauntlet/USDC)
        if (marketInfoList.length > 0 && !selectedMarket) {
          const defaultMarket =
            marketInfoList.find((m) => m.name === 'Gauntlet') ||
            marketInfoList[0]
          console.log(
            `${logPrefix} Setting default market:`,
            defaultMarket.name,
            'asset:',
            defaultMarket.asset.metadata.symbol,
          )

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
    handleMintAsset,
    isLoadingApy,
    apy,
    isInitialLoad,
    isLoadingPosition,
    depositedAmount,
    handleTransaction,
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
  }, [selectedMarket, depositedAmount, apy, setMarketPositions])

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
    apy,
    isLoadingApy,
    depositedAmount,
    isLoadingPosition,
    isInitialLoad,
    // Actions
    handleMintAsset,
    handleTransaction,
  }
}
