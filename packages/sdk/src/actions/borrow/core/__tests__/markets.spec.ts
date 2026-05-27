import { describe, expect, it } from 'vitest'

import { marketIdMatches } from '@/actions/borrow/core/markets.js'
import type { BorrowMarketId } from '@/types/borrow/index.js'

const chainId = 84532 as const
const a: BorrowMarketId = {
  kind: 'morpho-blue',
  marketId:
    '0x1111111111111111111111111111111111111111111111111111111111111111',
  chainId,
}

describe('marketIdMatches', () => {
  it('returns true for identical ids', () => {
    expect(marketIdMatches(a, { ...a })).toBe(true)
  })

  it('returns true when marketId case differs', () => {
    expect(
      marketIdMatches(a, {
        ...a,
        marketId: a.marketId.toUpperCase() as `0x${string}`,
      }),
    ).toBe(true)
  })

  it('returns false when chainId differs', () => {
    expect(marketIdMatches(a, { ...a, chainId: 1 as never })).toBe(false)
  })

  it('returns false when marketId differs', () => {
    expect(
      marketIdMatches(a, {
        ...a,
        marketId:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ).toBe(false)
  })
})
