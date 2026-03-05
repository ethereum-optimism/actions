export const SYMBOL_LOGO: Record<string, string> = {
  USDC_DEMO: '/usd-coin-usdc-logo.svg',
  USDC: '/usd-coin-usdc-logo.svg',
  ETH: '/eth.svg',
  OP_DEMO: '/OP.svg',
  OP: '/OP.svg',
}

export const MARKET_LOGO: Record<string, string> = {
  Morpho: '/morpho-logo.svg',
  Aave: '/aave-logo.svg',
  Uniswap: '/uniswap-logo.svg',
}

export function getAssetLogo(symbol: string): string {
  return SYMBOL_LOGO[symbol] || '/usd-coin-usdc-logo.svg'
}
