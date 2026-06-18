/**
 * Hardcoded USD prices for demo assets. Retired by #482 (PriceProvider).
 */

const STUB_PRICES_USD: Readonly<Record<string, number>> = {
  USDC: 1.0,
  USDC_DEMO: 1.0,
  OP: 0.1,
  OP_DEMO: 0.1,
  ETH: 1770,
  WETH: 1770,
}

export function stubPriceUsd(symbol: string): number {
  return (
    STUB_PRICES_USD[symbol] ?? STUB_PRICES_USD[symbol.replace('_DEMO', '')] ?? 0
  )
}
