import { useState, useCallback, useRef, useEffect } from 'react'
import type { LendMarket, LendMarketPosition, LendMarketId } from '@eth-optimism/actions-sdk'

interface UseMarketPositionsConfig {
  getPosition: (marketId: LendMarketId, withLogging?: boolean) => Promise<LendMarketPosition>
  isReady: () => boolean
  allMarkets: LendMarket[]
  selectedMarketId?: LendMarketId | null
}

/**
 * Hook to manage market positions (lent balances)
 * Fetches all positions once on mount and caches them client-side
 */
export function useMarketPositions({
  getPosition,
  isReady,
  allMarkets,
  selectedMarketId,
}: UseMarketPositionsConfig) {
  const [isLoadingPosition, setIsLoadingPosition] = useState(false)
  const [depositedAmount, setDepositedAmount] = useState<string | null>(null)
  const [allMarketPositions, setAllMarketPositions] = useState<Map<string, LendMarketPosition>>(new Map())
  const hasLoadedPositions = useRef(false)

  // Helper to create a unique key for a market
  const getMarketKey = useCallback((marketId: LendMarketId) => {
    return `${marketId.chainId}-${marketId.address.toLowerCase()}`
  }, [])

  // Fetch all market positions once and store them
  const fetchAllPositions = useCallback(async (markets: LendMarket[]) => {
    try {
      setIsLoadingPosition(true)
      console.log('[fetchAllPositions] Fetching positions for all markets...')

      const positionPromises = markets.map(async (market) => {
        try {
          const position = await getPosition(market.marketId, true) // Enable logging for initial position fetch
          return { marketId: market.marketId, position }
        } catch (error) {
          console.error(`[fetchAllPositions] Error fetching position for market ${market.marketId.address}:`, error)
          return null
        }
      })

      const results = await Promise.all(positionPromises)
      const positionsMap = new Map<string, LendMarketPosition>()

      results.forEach((result) => {
        if (result) {
          const key = getMarketKey(result.marketId)
          positionsMap.set(key, result.position)
          console.log(`[fetchAllPositions] Loaded position for ${key}: ${result.position.balanceFormatted}`)
        }
      })

      setAllMarketPositions(positionsMap)
      setIsLoadingPosition(false)
    } catch (error) {
      console.error('[fetchAllPositions] Error:', error)
      // Keep loading state on error
    }
  }, [getPosition, getMarketKey])

  // Update displayed position from cached positions (no API call)
  const updateDisplayedPosition = useCallback(() => {
    if (!selectedMarketId || allMarketPositions.size === 0) {
      console.log('[updateDisplayedPosition] No data available yet')
      return
    }

    const key = getMarketKey(selectedMarketId)
    const position = allMarketPositions.get(key)

    if (position) {
      console.log('[updateDisplayedPosition] Setting position for', key, ':', position.balanceFormatted)
      setDepositedAmount(position.balanceFormatted)
    } else {
      console.log('[updateDisplayedPosition] No position found for', key)
      setDepositedAmount('0.00')
    }
  }, [selectedMarketId, allMarketPositions, getMarketKey])

  // Update a single position in the cache (after deposit/withdraw)
  const updatePosition = useCallback(async (marketId: LendMarketId) => {
    try {
      const position = await getPosition(marketId, false)
      const key = getMarketKey(marketId)
      setAllMarketPositions((prev) => {
        const newMap = new Map(prev)
        newMap.set(key, position)
        return newMap
      })
      setDepositedAmount(position.balanceFormatted)
    } catch (error) {
      console.error('[updatePosition] Error:', error)
      setDepositedAmount('0.00')
    }
  }, [getPosition, getMarketKey])

  // Fetch all positions once when markets are loaded
  useEffect(() => {
    if (!isReady() || hasLoadedPositions.current || allMarkets.length === 0) {
      return
    }

    console.log('[useMarketPositions] Fetching all positions once for', allMarkets.length, 'markets')
    hasLoadedPositions.current = true
    fetchAllPositions(allMarkets).catch((error) => {
      console.error('Error fetching positions:', error)
      hasLoadedPositions.current = false // Reset on error to allow retry
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady(), allMarkets.length])

  // Update displayed position when market changes (no API call, just UI update)
  useEffect(() => {
    if (!selectedMarketId || allMarketPositions.size === 0) {
      return
    }

    console.log('[useMarketPositions] Market changed, updating displayed position')
    updateDisplayedPosition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMarketId, allMarketPositions])

  return {
    isLoadingPosition,
    depositedAmount,
    updatePosition,
    getMarketKey,
  }
}
