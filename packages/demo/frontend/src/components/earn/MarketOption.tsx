import type { Asset } from '@eth-optimism/actions-sdk'

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

const cleanSymbol = (symbol: string) => symbol.replace('_DEMO', '')

const formatApy = (apy: number | null) => {
  if (apy === null) return '0.00%'
  return `${(apy * 100).toFixed(2)}%`
}

export function MarketOption({ market }: { market: MarketInfo }) {
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
