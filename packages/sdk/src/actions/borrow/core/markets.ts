import { findMatchingConfig } from '@/actions/shared/marketConfigs.js'
import type {
  BorrowMarketConfig,
  BorrowMarketId,
} from '@/types/borrow/index.js'

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

/**
 * Find a borrow market config in an allowlist by market id.
 * @param allowlist - Optional list of allowed markets
 * @param marketId - Market identifier to look up
 * @returns Matching market config, if any
 */
export function findBorrowMarketInAllowlist(
  allowlist: readonly BorrowMarketConfig[] | undefined,
  marketId: BorrowMarketId,
): BorrowMarketConfig | undefined {
  return findMatchingConfig(allowlist, marketId, marketIdMatches)
}
