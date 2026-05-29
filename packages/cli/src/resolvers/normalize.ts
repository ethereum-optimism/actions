/**
 * @description Normalises a market name for case- and punctuation-insensitive matching. Lowercases, then strips whitespace, hyphens, and slashes so `Gauntlet USDC`, `gauntlet-usdc`, `GauntletUSDC`, `Demo dUSDC / OP`, and `demo-dusdc-op` collapse to the same key. Used by both `resolveMarket` (lend) and `resolveBorrowMarket` so the matching rule lives in one place. Stripping `/` is harmless for lend market names (none contain a slash today) and required for the borrow demo market `Demo dUSDC / OP`.
 * @param value - Market name as it appears in config or argv.
 * @returns Normalised key for direct equality comparison.
 */
export function normalizeMarketName(value: string): string {
  return value.toLowerCase().replace(/[\s/-]/g, '')
}
