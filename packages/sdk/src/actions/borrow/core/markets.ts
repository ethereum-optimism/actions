import type { BorrowProviderName } from '@/types/actions.js'
import type { BorrowMarketId } from '@/types/borrow/index.js'

// Exhaustive map from market kind to provider name; compile error on missing variant.
const BORROW_PROVIDER_BY_KIND: Record<
  BorrowMarketId['kind'],
  BorrowProviderName
> = {
  'morpho-blue': 'morpho',
  'aave-v3': 'aave',
}

export function borrowProviderForKind(
  kind: BorrowMarketId['kind'],
): BorrowProviderName {
  return BORROW_PROVIDER_BY_KIND[kind]
}

/**
 * Structural equality for two `BorrowMarketId` values across every variant.
 * @description Compares `kind`, `chainId`, and a case-insensitive `marketId`
 * hex. Pair with `findMatchingConfig` for allowlist lookup, tamper guards,
 * namespace routing, and mock stubs so the three-field comparison stays in
 * one place when new variants land.
 */
export function marketIdMatches(a: BorrowMarketId, b: BorrowMarketId): boolean {
  return (
    a.kind === b.kind &&
    a.chainId === b.chainId &&
    a.marketId.toLowerCase() === b.marketId.toLowerCase()
  )
}
