import type { LendMarket, LendMarketConfig } from '@eth-optimism/actions-sdk'
import type { MarketInfo } from '@/components/earn/MarketSelector'
import { CHAIN_DISPLAY, getAssetLogo } from '@/constants/logos'

const PROVIDER_DISPLAY: Record<string, { name: string; logo: string }> = {
  morpho: { name: 'Morpho', logo: '/morpho-logo.svg' },
  aave: { name: 'Aave', logo: '/aave-logo-dark.svg' },
}

const DEFAULT_PROVIDER = { name: 'Unknown', logo: '/morpho-logo.svg' }

function getNetworkInfo(chainId: number) {
  return (
    CHAIN_DISPLAY[chainId] ?? { name: 'Unknown', logo: '/OPMainnet_Circle.svg' }
  )
}

export function convertLendMarketToMarketInfo(
  market: LendMarket,
  config?: LendMarketConfig,
): MarketInfo {
  const provider = config?.lendProvider ?? 'morpho'
  const { name: providerName, logo: providerLogo } =
    PROVIDER_DISPLAY[provider] ?? DEFAULT_PROVIDER
  const network = getNetworkInfo(market.marketId.chainId)

  return {
    name: providerName,
    logo: providerLogo,
    networkName: network.name,
    networkLogo: network.logo,
    asset: market.asset,
    assetLogo: getAssetLogo(market.asset.metadata.symbol),
    apy: market.apy.total,
    isLoadingApy: false,
    marketId: market.marketId,
    provider,
  }
}
