import { useState, useCallback, useEffect, useRef } from 'react'
import type { TokenBalance } from '@eth-optimism/actions-sdk/react'
import type {
  Asset,
  LendMarket,
  LendMarketId,
  LendMarketPosition,
  LendTransactionReceipt,
} from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import type { LendExecutePositionParams } from '@/types/api'
import { useActivityLogger } from './useActivityLogger'
import { useMarketPositions } from './useMarketPositions'
import { useTransactionHandler } from './useTransactionHandler'
import { useMarketInfo } from './useMarketInfo'
import { matchAssetBalance } from '@/utils/balanceMatching'

export interface UseWalletBalanceConfig {
  getTokenBalances: () => Promise<TokenBalance[]>
  getMarkets: () => Promise<LendMarket[]>
  getPosition: (marketId: LendMarketId) => Promise<LendMarketPosition>
  mintAsset: (assetSymbol: string, chainId: number) => Promise<void>
  openPosition: (params: LendExecutePositionParams) => Promise<LendTransactionReceipt>
  closePosition: (params: LendExecutePositionParams) => Promise<LendTransactionReceipt>
  isReady: () => boolean
  selectedMarketId?: LendMarketId | null
  selectedAssetSymbol?: string
  selectedMarketApy?: number | null
  allMarkets?: LendMarket[]
}

/**
 * Main hook for wallet balance and market operations
 * Coordinates balance fetching, position management, and transactions
 */
export function useWalletBalance(params: UseWalletBalanceConfig) {
  const {
    getTokenBalances: getTokenBalancesRaw,
    getMarkets,
    getPosition: getPositionRaw,
    mintAsset: mintAssetRaw,
    isReady,
    openPosition,
    closePosition,
    selectedMarketId,
    selectedAssetSymbol = 'USDC',
    selectedMarketApy,
    allMarkets = [],
  } = params

  const { logActivity } = useActivityLogger()
  const [assetBalance, setAssetBalance] = useState<string>('0.00')
  const [displayedBalance, setDisplayedBalance] = useState<string>('0.00') // What's actually shown to user
  const [isLoadingBalance, setIsLoadingBalance] = useState(true) // Start with true to show shimmer on initial load
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [allTokenBalances, setAllTokenBalances] = useState<TokenBalance[] | null>(null)
  const [hasCalculatedInitialBalance, setHasCalculatedInitialBalance] = useState(false)
  const hasLoadedBalances = useRef(false)
  const previousMarketId = useRef<string | null>(null)

  // Wrap API calls with activity logging
  const getTokenBalances = useCallback(async () => {
    const activity = logActivity('getBalance')
    try {
      const result = await getTokenBalancesRaw()
      activity?.confirm()
      return result
    } catch (error) {
      activity?.error()
      throw error
    }
  }, [getTokenBalancesRaw, logActivity])

  const getPosition = useCallback(
    async (marketId: LendMarketId, withLogging: boolean = true) => {
      const activity = withLogging ? logActivity('getPosition') : null
      try {
        const result = await getPositionRaw(marketId)
        activity?.confirm()
        return result
      } catch (error) {
        activity?.error()
        throw error
      }
    },
    [getPositionRaw, logActivity],
  )

  // Use position management hook
  const { isLoadingPosition, depositedAmount, updatePosition, getMarketKey } = useMarketPositions({
    getPosition,
    isReady,
    allMarkets,
    selectedMarketId,
  })

  // Use market info hook
  const { apy, isLoadingApy, isInitialLoad, marketData } = useMarketInfo({
    getMarkets,
    isReady,
    selectedMarketId,
    selectedMarketApy,
    selectedAssetSymbol,
    logActivity,
  })

  // Fetch all token balances once and store them
  const fetchAllBalances = useCallback(async () => {
    try {
      console.log('[fetchAllBalances] START - Setting isLoadingBalance=true')
      setIsLoadingBalance(true)
      console.log('[fetchAllBalances] Fetching all token balances...')
      const tokenBalances = await getTokenBalances()
      setAllTokenBalances(tokenBalances)
      console.log(
        '[fetchAllBalances] Loaded balances for:',
        tokenBalances.map((t) => t.symbol),
      )
      console.log('[fetchAllBalances] COMPLETE - balances loaded, waiting for balance calculation')
      // Don't set isLoadingBalance=false here - let the useEffect that calculates the balance do it
    } catch (error) {
      console.error('[fetchAllBalances] Error:', error)
      setIsLoadingBalance(false)
    }
  }, [getTokenBalances])

  // Mint asset (Get USDC / Get WETH button)
  const handleMintAsset = useCallback(async () => {
    if (!isReady() || !selectedMarketId) {
      return
    }

    const activity = logActivity('mint')
    try {
      setIsLoadingBalance(true)
      await mintAssetRaw(selectedAssetSymbol, selectedMarketId.chainId)
      activity?.confirm()
      await fetchAllBalances()
      // Balance will be updated by the useEffect when allTokenBalances changes
    } catch (error) {
      activity?.error()
      console.error('Error minting asset:', error)
      setIsLoadingBalance(false)
    }
  }, [
    mintAssetRaw,
    isReady,
    fetchAllBalances,
    selectedAssetSymbol,
    selectedMarketId,
    logActivity,
  ])

  // Use transaction handler hook
  const { handleTransaction } = useTransactionHandler({
    isReady,
    marketData,
    openPosition,
    closePosition,
    logActivity,
    onTransactionComplete: async (marketId: LendMarketId) => {
      await updatePosition(marketId)
      await fetchAllBalances()
      // Balance will be updated by the useEffect when allTokenBalances changes
    },
  })

  // Fetch all balances once on mount
  useEffect(() => {
    if (!isReady() || hasLoadedBalances.current) {
      return
    }

    console.log('[useWalletBalance] Fetching all balances once on mount')
    hasLoadedBalances.current = true
    fetchAllBalances().catch((error) => {
      console.error('Error fetching balances:', error)
      hasLoadedBalances.current = false
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady()])

  // Update displayed balance when market changes (no API call, just UI update)
  useEffect(() => {
    if (!allTokenBalances || !selectedAssetSymbol || !marketData) {
      return
    }

    const currentMarketKey = `${marketData.marketId.chainId}-${marketData.marketId.address}`
    const hasMarketChanged = previousMarketId.current && previousMarketId.current !== currentMarketKey

    // Calculate the new balance immediately (don't rely on state updates)
    const newBalance = matchAssetBalance({
      allTokenBalances,
      selectedAssetSymbol,
      marketData,
    })

    console.log('[useWalletBalance] Balance calculation', {
      hasMarketChanged,
      from: previousMarketId.current,
      to: currentMarketKey,
      currentDisplayedBalance: displayedBalance,
      currentAssetBalance: assetBalance,
      newBalance,
    })

    if (hasMarketChanged) {
      // Show shimmer briefly when switching markets to prevent flash
      console.log('[useWalletBalance] Market changed, showing transition shimmer')
      setIsTransitioning(true)
      setAssetBalance(newBalance)
      // After shimmer delay, update the displayed balance and hide shimmer
      setTimeout(() => {
        console.log('[useWalletBalance] Transition complete, updating displayedBalance to:', newBalance)
        setDisplayedBalance(newBalance)
        setIsTransitioning(false)
      }, 300) // Keep shimmer for smooth transition
    } else {
      console.log('[useWalletBalance] Updating displayed balance (no market change)')
      setAssetBalance(newBalance)
      setDisplayedBalance(newBalance)
    }

    // Mark that we've calculated the initial balance and can stop showing loading shimmer
    if (!hasCalculatedInitialBalance) {
      console.log('[useWalletBalance] First balance calculation complete, setting isLoadingBalance=false')
      setHasCalculatedInitialBalance(true)
      setIsLoadingBalance(false)
    }

    previousMarketId.current = currentMarketKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAssetSymbol, marketData, allTokenBalances])

  // Sync displayed balance with actual balance when not transitioning and not on initial load
  useEffect(() => {
    if (!isTransitioning && hasCalculatedInitialBalance) {
      console.log('[useWalletBalance] Syncing displayedBalance with assetBalance:', assetBalance)
      setDisplayedBalance(assetBalance)
    }
  }, [assetBalance, isTransitioning, hasCalculatedInitialBalance])

  // Debug logging for all state changes
  useEffect(() => {
    console.log('[useWalletBalance STATE]', {
      assetBalance,
      displayedBalance,
      isLoadingBalance,
      isTransitioning,
      timestamp: Date.now(),
    })
  }, [assetBalance, displayedBalance, isLoadingBalance, isTransitioning])

  return {
    assetBalance: displayedBalance, // Return the displayed balance, not the actual one during transitions
    isLoadingBalance: isLoadingBalance || isTransitioning,
    handleMintAsset,
    isLoadingApy,
    apy,
    isInitialLoad,
    isLoadingPosition,
    depositedAmount,
    handleTransaction,
  }
}
