import type { BorrowMarketId } from '@/types/borrow/index.js'

/**
 * Structural equality for two `BorrowMarketId` values across every variant.
 * @description Compares `kind`, `chainId`, and a case-insensitive `marketId`
 * hex. Used by providers (allowlist lookup, tamper guards), namespaces
 * (provider routing), and mocks (test stubs) so the three-field comparison
 * stays in one place when new variants land.
 */
export function marketIdMatches(a: BorrowMarketId, b: BorrowMarketId): boolean {
  return (
    a.kind === b.kind &&
    a.chainId === b.chainId &&
    a.marketId.toLowerCase() === b.marketId.toLowerCase()
  )
}
