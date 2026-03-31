import { Dropdown } from './Dropdown'
import { MarketOption, type MarketInfo } from './MarketOption'
import Shimmer from './Shimmer'

export type { MarketInfo } from './MarketOption'

interface MarketSelectorProps {
  markets: MarketInfo[]
  selectedMarket: MarketInfo | null
  onMarketSelect: (market: MarketInfo) => void
  isLoading?: boolean
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
