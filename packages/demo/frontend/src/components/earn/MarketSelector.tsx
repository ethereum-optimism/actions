import type { Asset } from '@eth-optimism/actions-sdk'

import { Dropdown } from './Dropdown'
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

const formatApy = (apy: number | null) => {
  if (apy === null) return '0.00%'
  return `${(apy * 100).toFixed(2)}%`
}

function MarketOption({ market }: { market: MarketInfo }) {
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

export function MarketSelector({
  markets,
  selectedMarket,
  onMarketSelect,
  isLoading = false,
}: MarketSelectorProps) {
  return (
    <Dropdown<MarketInfo>
      options={markets}
      selected={selectedMarket}
      onSelect={onMarketSelect}
      keyOf={(m) => `${m.marketId.address}-${m.marketId.chainId}`}
      isSelected={(m, sel) =>
        m.marketId.address === sel?.marketId.address &&
        m.marketId.chainId === sel?.marketId.chainId
      }
      placeholder="Select a market"
      isLoading={isLoading}
      loadingContent={
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
      }
      renderOption={(market) => <MarketOption market={market} />}
    />
  )
}
