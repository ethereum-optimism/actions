import { describe, expect, it } from 'vitest'

import { findBorrowMarketInAllowlist } from '@/actions/borrow/core/markets.js'
import type { BorrowMarketConfig } from '@/types/borrow/index.js'

const chainId = 84532 as const

const baseMarket: BorrowMarketConfig = {
  kind: 'morpho-blue',
  marketId:
    '0x1111111111111111111111111111111111111111111111111111111111111111',
  chainId,
  name: 'Market One',
  collateralAsset: {
    type: 'erc20',
    address: { [chainId]: '0x1111111111111111111111111111111111111111' },
    metadata: { symbol: 'COL', name: 'Collateral', decimals: 18 },
  },
  borrowAsset: {
    type: 'erc20',
    address: { [chainId]: '0x2222222222222222222222222222222222222222' },
    metadata: { symbol: 'BRW', name: 'Borrow', decimals: 18 },
  },
  borrowProvider: 'morpho',
  marketParams: {
    loanToken: '0x2222222222222222222222222222222222222222',
    collateralToken: '0x1111111111111111111111111111111111111111',
    oracle: '0x3333333333333333333333333333333333333333',
    irm: '0x4444444444444444444444444444444444444444',
    lltv: 860000000000000000n,
  },
}

describe('findBorrowMarketInAllowlist', () => {
  it('returns the matching config', () => {
    expect(
      findBorrowMarketInAllowlist([baseMarket], {
        kind: 'morpho-blue',
        marketId: baseMarket.marketId,
        chainId,
      }),
    ).toEqual(baseMarket)
  })

  it('returns undefined when the market is absent', () => {
    expect(
      findBorrowMarketInAllowlist([baseMarket], {
        kind: 'morpho-blue',
        marketId:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        chainId,
      }),
    ).toBeUndefined()
  })
})
