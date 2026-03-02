/**
 * Strip demo suffixes from token symbols for display
 */
export function displaySymbol(symbol: string): string {
  return symbol.replace('_DEMO', '')
}

/**
 * Check if a token is a stablecoin (currently only USDC)
 */
export function isStablecoin(symbol: string): boolean {
  return displaySymbol(symbol).toUpperCase() === 'USDC'
}

/**
 * Format a numeric amount as a USD string.
 * Returns null if the amount is zero or invalid.
 */
export function formatUsd(amount: number, usdPerToken = 1): string | null {
  if (!amount || amount <= 0) return null
  return `$${(amount * usdPerToken).toFixed(2)}`
}

/**
 * Map of token symbols to human-readable names
 */
const TOKEN_NAMES: Record<string, string> = {
  ETH: 'Ethereum',
  WETH: 'Wrapped Ether',
  USDC: 'USD Coin',
  OP: 'Optimism',
}

/**
 * Get the human-readable name for a token symbol
 */
export function getTokenName(symbol: string): string {
  const clean = displaySymbol(symbol)
  return TOKEN_NAMES[clean] || clean
}

/**
 * Derive USD-per-token rate for a swap pair.
 * Stablecoins are assumed 1:1 with USD. Non-stablecoins derive
 * their rate from the other side if it's a stablecoin.
 */
export function deriveUsdRates(
  symbolIn: string,
  symbolOut: string,
  amountIn: number,
  amountOut: number,
): { usdPerIn: number; usdPerOut: number } {
  const inIsStable = isStablecoin(symbolIn)
  const outIsStable = isStablecoin(symbolOut)

  const usdPerIn = inIsStable
    ? 1
    : outIsStable && amountIn > 0
      ? amountOut / amountIn
      : 1
  const usdPerOut = outIsStable
    ? 1
    : inIsStable && amountOut > 0
      ? amountIn / amountOut
      : 1

  return { usdPerIn, usdPerOut }
}

/**
 * Split a numeric string into main and secondary parts for display.
 * Shows first 4 decimals as main, rest as secondary (smaller text).
 */
export function formatSwapAmount(amount: string): {
  main: string
  secondary: string
} {
  const num = parseFloat(amount)
  if (isNaN(num) || num === 0) return { main: '0', secondary: '' }

  const [whole, decimal = ''] = amount.split('.')
  if (decimal.length <= 4) return { main: amount, secondary: '' }

  return {
    main: `${whole}.${decimal.substring(0, 4)}`,
    secondary: decimal.substring(4),
  }
}
