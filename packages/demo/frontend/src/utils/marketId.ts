import type { BorrowMarketId } from '@eth-optimism/actions-sdk'

/** True when two borrow market IDs refer to the same market, across all provider kinds. */
export function sameMarketId(a: BorrowMarketId, b: BorrowMarketId): boolean {
  return (
    a.kind === b.kind &&
    a.chainId === b.chainId &&
    a.marketId.toLowerCase() === b.marketId.toLowerCase()
  )
}

/** Stable React key for a borrow market id, across every provider variant. */
export function marketIdKey(id: BorrowMarketId): string {
  return `${id.kind}-${id.marketId}-${id.chainId}`
}
