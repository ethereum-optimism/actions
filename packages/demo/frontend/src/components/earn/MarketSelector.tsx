import { useState, useEffect, useRef } from 'react'
import type { Asset } from '@eth-optimism/actions-sdk'
import Shimmer from './Shimmer'

export interface MarketInfo {
  name: string
  logo: string
  networkName: string
  networkLogo: string
  asset: Asset
  assetLogo: string
  apy: number | null
  isLoadingApy?: boolean
  marketId: {
    address: string
    chainId: number
  }
  provider: 'morpho' | 'aave'
}

interface MarketSelectorProps {
  markets: MarketInfo[]
  selectedMarket: MarketInfo | null
  onMarketSelect: (market: MarketInfo) => void
  isLoading?: boolean
}

const cleanSymbol = (symbol: string) => symbol.replace('_DEMO', '')

export function MarketSelector({
  markets,
  selectedMarket,
  onMarketSelect,
  isLoading = false,
}: MarketSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMarketClick = (market: MarketInfo) => {
    onMarketSelect(market)
    setIsOpen(false)
  }

  const formatApy = (apy: number | null) => {
    if (apy === null) return '0.00%'
    return `${(apy * 100).toFixed(2)}%`
  }

  const renderMarketContent = (market: MarketInfo | null) => {
    if (!market) {
      return (
        <span className="text-sm" style={{ color: '#666666' }}>
          Select a market
        </span>
      )
    }

    return (
      <div className="flex items-center gap-2 flex-1">
        <div className="relative flex items-center">
          <img
            src={market.assetLogo}
            alt={market.asset.metadata.symbol}
            className="h-6 w-6"
          />
          <div
            className="absolute -right-1 -bottom-1 bg-white rounded-full flex items-center justify-center"
            style={{ width: '18px', height: '18px', padding: '2px' }}
          >
            <img
              src={market.logo}
              alt={market.name}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
              }}
            />
          </div>
        </div>
        <span className="text-sm font-medium" style={{ color: '#1a1b1e' }}>
          {market.name} {cleanSymbol(market.asset.metadata.symbol)}
        </span>
        <span className="text-sm" style={{ color: '#666666' }}>
          on
        </span>
        <img
          src={market.networkLogo}
          alt={market.networkName}
          className="h-5 w-5"
        />
        <span className="text-sm" style={{ color: '#666666' }}>
          {market.networkName}
        </span>
        <span
          className="text-sm font-semibold ml-auto"
          style={{ color: '#1a1b1e' }}
        >
          {market.isLoadingApy ? '...' : formatApy(market.apy)} APY
        </span>
      </div>
    )
  }

  // Show shimmer when loading OR when there are no markets (failed to load)
  if (isLoading || (markets.length === 0 && !selectedMarket)) {
    return (
      <div className="w-full">
        <div
          className="flex items-center gap-3 w-full px-4 py-3"
          style={{
            border: '1px solid #E0E2EB',
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            minHeight: '48px',
          }}
        >
          <Shimmer width="24px" height="24px" variant="circle" />
          <Shimmer width="100%" height="16px" variant="rectangle" />
          <Shimmer width="40px" height="16px" variant="rectangle" />
        </div>
      </div>
    )
  }

  return (
    <div
      className="w-full relative"
      style={{
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
      ref={dropdownRef}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-4 py-3 transition-all hover:bg-gray-50"
        style={{
          border: '1px solid #E0E2EB',
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
        }}
      >
        {renderMarketContent(selectedMarket)}
        <svg
          className="w-4 h-4 transition-transform ml-2"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
            color: '#666666',
          }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute left-0 right-0 mt-1 shadow-lg overflow-hidden"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E0E2EB',
            borderRadius: '12px',
            zIndex: 50,
          }}
        >
          <div className="py-2">
            {markets
              .filter(
                (market) =>
                  !(
                    selectedMarket?.marketId.address ===
                      market.marketId.address &&
                    selectedMarket?.marketId.chainId === market.marketId.chainId
                  ),
              )
              .map((market, index) => {
                return (
                  <button
                    key={`${market.marketId.address}-${market.marketId.chainId}`}
                    onClick={() => handleMarketClick(market)}
                    className="w-full px-4 py-3 flex items-center transition-all hover:bg-gray-50"
                    style={{
                      borderTop: index > 0 ? '1px solid #E0E2EB' : 'none',
                    }}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <div className="relative flex items-center">
                        <img
                          src={market.assetLogo}
                          alt={market.asset.metadata.symbol}
                          className="h-6 w-6"
                        />
                        <div
                          className="absolute -right-1 -bottom-1 bg-white rounded-full flex items-center justify-center"
                          style={{
                            width: '18px',
                            height: '18px',
                            padding: '2px',
                          }}
                        >
                          <img
                            src={market.logo}
                            alt={market.name}
                            style={{
                              maxWidth: '100%',
                              maxHeight: '100%',
                              width: 'auto',
                              height: 'auto',
                            }}
                          />
                        </div>
                      </div>
                      <span
                        className="text-sm font-medium"
                        style={{ color: '#1a1b1e' }}
                      >
                        {market.name}{' '}
                        {cleanSymbol(market.asset.metadata.symbol)}
                      </span>
                      <span className="text-sm" style={{ color: '#666666' }}>
                        on
                      </span>
                      <img
                        src={market.networkLogo}
                        alt={market.networkName}
                        className="h-5 w-5"
                      />
                      <span className="text-sm" style={{ color: '#666666' }}>
                        {market.networkName}
                      </span>
                      <span
                        className="text-sm font-semibold ml-auto"
                        style={{ color: '#1a1b1e' }}
                      >
                        {market.isLoadingApy ? '...' : formatApy(market.apy)}{' '}
                        APY
                      </span>
                    </div>
                  </button>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
