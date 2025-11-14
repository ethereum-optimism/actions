import { useState, useCallback, useEffect, useRef } from 'react'
import type { LendMarket, LendMarketId, Asset } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import { formatMarketResponse } from '@/utils/formatters'
import { USDCDemoVault } from '@/constants/markets'

interface UseMarketInfoConfig {
  getMarkets: () => Promise<LendMarket[]>
  isReady: () => boolean
  selectedMarketId?: LendMarketId | null
  selectedMarketApy?: number | null
  selectedAssetSymbol?: string
  logActivity?: (action: string) => any
}

/**
 * Hook to manage market APY and asset data
 * Fetches market information when the selected market changes
 */
export function useMarketInfo({
  getMarkets,
  isReady,
  selectedMarketId,
  selectedMarketApy,
  selectedAssetSymbol,
  logActivity,
}: UseMarketInfoConfig) {
  const [isLoadingApy, setIsLoadingApy] = useState(true)
  const [apy, setApy] = useState<number | null>(null)
  const [marketData, setMarketData] = useState<{
    marketId: LendMarketId
    assetAddress: Address
    asset: Asset
  } | null>(null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const hasInitiatedMarketFetch = useRef(false)

  // Clear APY state when market changes
  useEffect(() => {
    console.log('[useMarketInfo] Market changed, clearing APY state')
    setApy(null)
    setIsLoadingApy(true)
  }, [selectedMarketId])

  // Fetch market APY and data when selected market changes
  useEffect(() => {
    const fetchMarketApy = async () => {
      // Skip if APY already provided by parent
      if (selectedMarketApy !== undefined && selectedMarketApy !== null) {
        setApy(selectedMarketApy)
        setIsLoadingApy(false)
        setIsInitialLoad(false)

        // Still need to fetch market data for asset address
        if (selectedMarketId && selectedAssetSymbol) {
          try {
            const markets = await getMarkets()
            const market = markets.find(
              (m) =>
                m.marketId.address.toLowerCase() ===
                  selectedMarketId.address.toLowerCase() &&
                m.marketId.chainId === selectedMarketId.chainId,
            )
            if (market) {
              const assetAddress = (market.asset.address[
                market.marketId.chainId
              ] || Object.values(market.asset.address)[0]) as Address
              setMarketData({
                marketId: market.marketId,
                assetAddress,
                asset: market.asset,
              })
            }
          } catch {
            // Error fetching market data
          }
        }
        return
      }

      if (!selectedMarketId) {
        // Use default USDC Demo market on initial load
        if (hasInitiatedMarketFetch.current) {
          return
        }
        hasInitiatedMarketFetch.current = true
      }

      console.log('[getMarkets] Fetching market data...')

      const activity = logActivity?.('getMarket')
      try {
        const markets = await getMarkets()
        activity?.confirm()
        const formattedMarkets = markets.map((market) =>
          formatMarketResponse(market),
        )

        const targetMarket = selectedMarketId || USDCDemoVault
        const market = formattedMarkets.find(
          (market) =>
            market.marketId.address.toLowerCase() ===
              targetMarket.address.toLowerCase() &&
            market.marketId.chainId === targetMarket.chainId,
        )

        if (market) {
          setApy(market.apy.total)

          // Store market data for transactions
          const assetAddress = (market.asset.address[market.marketId.chainId] ||
            Object.values(market.asset.address)[0]) as Address

          setMarketData({
            marketId: market.marketId,
            assetAddress,
            asset: market.asset,
          })
        }
        setIsLoadingApy(false)
        setIsInitialLoad(false)
      } catch (error) {
        activity?.error()
        console.log(
          '[fetchMarketApy] Error fetching market data, keeping shimmer state',
        )
      }
    }

    fetchMarketApy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMarketId, selectedMarketApy, selectedAssetSymbol])

  return {
    apy,
    isLoadingApy,
    marketData,
    isInitialLoad,
  }
}
