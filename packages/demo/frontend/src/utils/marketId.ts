import type { BorrowMarketId } from '@eth-optimism/actions-sdk'

/** True when two borrow market IDs refer to the same market. */
export function sameMarketId(a: BorrowMarketId, b: BorrowMarketId): boolean {
  if (a.kind !== b.kind || a.chainId !== b.chainId) return false
  if (a.kind === 'morpho-blue' && b.kind === 'morpho-blue') {
    return a.marketId === b.marketId
  }
  return false
}
