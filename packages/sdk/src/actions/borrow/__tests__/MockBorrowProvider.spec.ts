import { describe, expect, it } from 'vitest'

import { MockBorrowProvider } from '@/actions/borrow/__mocks__/MockBorrowProvider.js'
import {
  collateralAsset,
  market,
  walletAddress,
} from '@/actions/borrow/__tests__/fixtures.js'

describe('MockBorrowProvider', () => {
  it('returns a stubbed market for an allowlisted id', async () => {
    const provider = new MockBorrowProvider({ marketAllowlist: [market] })
    const result = await provider.getMarket({
      kind: market.kind,
      marketId: market.marketId,
      chainId: market.chainId,
    })
    expect(result.maxLtv).toBeCloseTo(0.86)
    expect(result.collateralAsset).toBe(collateralAsset)
  })

  it('returns an empty position for a configured market', async () => {
    const provider = new MockBorrowProvider({ marketAllowlist: [market] })
    const position = await provider.getPosition({
      marketId: market,
      walletAddress,
    })
    expect(position.collateralShares).toBe(0n)
    expect(position.healthFactor).toBeNull()
  })

  it('emits a stubbed quote from each action method', async () => {
    const provider = new MockBorrowProvider({ marketAllowlist: [market] })
    const quote = await provider.openPosition({
      market,
      walletAddress,
      borrowAmount: { amountRaw: 1n },
    })
    expect(quote.action).toBe('open')
    expect(quote.execution.transactions).toEqual([])
    expect(quote.expiresAt).toBeGreaterThan(quote.quotedAt)
  })

  it('lets tests override individual methods via vi.fn().mockRejectedValue', async () => {
    const provider = new MockBorrowProvider({ marketAllowlist: [market] })
    provider.repay.mockRejectedValueOnce(new Error('boom'))
    await expect(
      provider.repay({
        market,
        walletAddress,
        amount: { amountRaw: 1n },
      }),
    ).rejects.toThrow('boom')
  })
})
