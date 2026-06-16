import type { BorrowProviderName } from '@/types/actions.js'
import type { BorrowMarketId } from '@/types/borrow/index.js'

/**
 * The borrow provider that services a given market `kind`. The `kind`
 * discriminant is the source of truth for routing; the provider name is
 * derived for display/output rather than stored on every market config. The
 * exhaustive `Record` keeps this in lockstep with `BorrowMarketId['kind']` so a
 * new market variant fails to compile until it is mapped.
 */
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
