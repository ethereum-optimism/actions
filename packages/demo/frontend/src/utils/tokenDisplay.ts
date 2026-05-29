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
 * Split a token amount string into a main part and a secondary part (the
 * latter rendered as smaller, dimmer trailing digits).
 *
 * Default precision is two decimals with no secondary part. Pass
 * `extended` (used for ETH, where two decimals is too coarse) to show
 * four decimals split as two main + two secondary digits.
 */
export function formatAmountParts(
  amount: string,
  extended = false,
): {
  main: string
  secondary: string
} {
  const num = parseFloat(amount)
  if (!extended) {
    return { main: Number.isNaN(num) ? '0.00' : num.toFixed(2), secondary: '' }
  }
  if (Number.isNaN(num)) return { main: '0.00', secondary: '00' }
  const [wholePart, decimalPart = '0000'] = num.toFixed(4).split('.')
  return {
    main: `${wholePart}.${decimalPart.substring(0, 2)}`,
    secondary: decimalPart.substring(2, 4),
  }
}

/**
 * Split a number into main and secondary decimal parts for display.
 * Shows first 4 decimals as main, rest as secondary (smaller text).
 */
export function formatSwapAmount(amount: number): {
  main: string
  secondary: string
} {
  if (amount === 0) return { main: '0', secondary: '' }

  const str = String(amount)
  const [whole, decimal = ''] = str.split('.')
  if (decimal.length <= 4) return { main: str, secondary: '' }

  return {
    main: `${whole}.${decimal.substring(0, 4)}`,
    secondary: decimal.substring(4, 8),
  }
}
