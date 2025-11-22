import type { LendMarket } from '@eth-optimism/actions-sdk'
import { baseSepolia, optimismSepolia } from 'viem/chains'
import type { MarketInfo } from '@/components/earn/MarketSelector'

export function convertLendMarketToMarketInfo(market: LendMarket): MarketInfo {
  const chainId = market.marketId.chainId

  // Determine network info
  let networkName = 'Unknown'
  let networkLogo = '/base-logo.svg'
  if (chainId === baseSepolia.id) {
    networkName = 'Base Sepolia'
    networkLogo = '/base-logo.svg'
  } else if (chainId === optimismSepolia.id) {
    networkName = 'Optimism Sepolia'
    networkLogo = '/OP.svg'
  }

  // Determine provider logo
  const providerLogo =
    market.name.toLowerCase().includes('gauntlet') ||
    market.name.toLowerCase().includes('morpho')
      ? '/morpho-logo.svg'
      : '/aave-logo-dark.svg'

  // Determine asset logo
  const assetSymbol = market.asset.metadata.symbol
  const assetLogo = assetSymbol.includes('USDC')
    ? '/usd-coin-usdc-logo.svg'
    : assetSymbol.includes('WETH')
      ? '/eth.svg'
      : '/usd-coin-usdc-logo.svg'

  // Extract simple market name
  const marketName = market.name.split(' ')[0] || market.name

  return {
    name: marketName,
    logo: providerLogo,
    networkName,
    networkLogo,
    asset: market.asset,
    assetLogo,
    apy: market.apy.total,
    isLoadingApy: false,
    marketId: market.marketId,
    provider: market.name.toLowerCase().includes('aave') ? 'aave' : 'morpho',
  }
}
