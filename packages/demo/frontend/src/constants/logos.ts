export const SYMBOL_LOGO: Record<string, string> = {
  USDC_DEMO: '/usd-coin-usdc-logo.svg',
  USDC: '/usd-coin-usdc-logo.svg',
  ETH: '/eth.svg',
  OP_DEMO: '/OP.svg',
  OP: '/OP.svg',
}

export const MARKET_LOGO: Record<string, string> = {
  Morpho: '/morpho-logo.svg',
  Aave: '/aave-logo-dark.svg',
  Uniswap: '/uniswap-logo.svg',
  Velodrome: '/velodrome-logo.svg',
  Aerodrome: '/aerodrome-logo.svg',
}

/** Map SDK provider names to display names per chain */
export const PROVIDER_DISPLAY_NAME: Record<string, Record<number, string>> = {
  velodrome: {
    8453: 'Aerodrome', // Base mainnet
    84532: 'Aerodrome', // Base Sepolia
  },
}

/** Get display name for a swap provider, accounting for chain-specific branding */
export function getProviderDisplayName(
  provider: string,
  chainId?: number,
): string {
  const chainMap = PROVIDER_DISPLAY_NAME[provider]
  if (chainMap && chainId && chainMap[chainId]) {
    return chainMap[chainId]
  }
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}

export function getAssetLogo(symbol: string): string {
  return SYMBOL_LOGO[symbol] || '/usd-coin-usdc-logo.svg'
}

export const CHAIN_DISPLAY: Record<number, { name: string; logo: string }> = {
  84532: { name: 'Base Sepolia', logo: '/base-logo.svg' },
  11155420: { name: 'OP Sepolia', logo: '/OPMainnet_Circle.svg' },
  130: { name: 'Unichain', logo: '/unichain-logo.svg' },
}

export const DEFAULT_CHAIN = {
  name: 'Unknown',
  logo: '/OPMainnet_Circle.svg',
}
