import { useState, useCallback } from 'react'
import type { MarketPosition } from '@/types/market'
import type { MarketInfo } from '@/components/earn/MarketSelector'

/**
 * Hook to manage market selection state
 * Shared between frontend and server wallet components
 */
export function useMarketData() {
  const [markets, setMarkets] = useState<MarketInfo[]>([])
  const [marketPositions, setMarketPositions] = useState<MarketPosition[]>([])
  const [selectedMarket, setSelectedMarket] = useState<MarketPosition | null>(
    null,
  )
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(true)

  const handleMarketSelect = useCallback((market: MarketInfo) => {
    setSelectedMarket({
      marketName: market.name,
      marketLogo: market.logo,
      networkName: market.networkName,
      networkLogo: market.networkLogo,
      assetSymbol: market.assetSymbol,
      assetLogo: market.assetLogo,
      apy: market.apy,
      depositedAmount: null,
      isLoadingApy: false,
      isLoadingPosition: false,
      marketId: market.marketId,
      provider: market.provider,
    })
  }, [])

  return {
    markets,
    setMarkets,
    marketPositions,
    setMarketPositions,
    selectedMarket,
    setSelectedMarket,
    isLoadingMarkets,
    setIsLoadingMarkets,
    handleMarketSelect,
  }
}
