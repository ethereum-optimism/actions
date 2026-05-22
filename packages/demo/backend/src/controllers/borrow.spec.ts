import { describe, expect, it } from 'vitest'

import { PriceBodySchema, QuoteBodySchema } from '@/controllers/borrow.js'

const MARKET_ID = {
  kind: 'morpho-blue',
  chainId: 84532,
  marketId:
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
}
const WALLET = '0xCccCccCccCccCccCccCccCccCccCccCccCccCccc'

describe('PriceBodySchema', () => {
  it('accepts an open action with optional walletAddress', () => {
    const result = PriceBodySchema.safeParse({
      action: 'open',
      marketId: MARKET_ID,
      borrowAmount: { amountRaw: '1000000' },
      walletAddress: WALLET,
    })
    expect(result.success).toBe(true)
  })

  it('accepts an open action without walletAddress', () => {
    const result = PriceBodySchema.safeParse({
      action: 'open',
      marketId: MARKET_ID,
      borrowAmount: { amountRaw: '1000000' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects unknown keys (strict)', () => {
    const result = PriceBodySchema.safeParse({
      action: 'open',
      marketId: MARKET_ID,
      borrowAmount: { amountRaw: '1000000' },
      extraneous: 'nope',
    })
    expect(result.success).toBe(false)
  })
})

describe('QuoteBodySchema', () => {
  it('accepts an open action without walletAddress', () => {
    const result = QuoteBodySchema.safeParse({
      action: 'open',
      marketId: MARKET_ID,
      borrowAmount: { amountRaw: '1000000' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects body-supplied walletAddress as unknown key', () => {
    const result = QuoteBodySchema.safeParse({
      action: 'open',
      marketId: MARKET_ID,
      borrowAmount: { amountRaw: '1000000' },
      walletAddress: WALLET,
    })
    expect(result.success).toBe(false)
  })

  it('rejects body-supplied walletAddress on repay variant', () => {
    const result = QuoteBodySchema.safeParse({
      action: 'repay',
      marketId: MARKET_ID,
      amount: { amountRaw: '1000000' },
      walletAddress: WALLET,
    })
    expect(result.success).toBe(false)
  })

  it('accepts each action variant without walletAddress', () => {
    const cases = [
      {
        action: 'open',
        marketId: MARKET_ID,
        borrowAmount: { amountRaw: '1' },
      },
      {
        action: 'close',
        marketId: MARKET_ID,
        borrowAmount: { amountRaw: '1' },
      },
      {
        action: 'depositCollateral',
        marketId: MARKET_ID,
        amount: { amountRaw: '1' },
      },
      {
        action: 'withdrawCollateral',
        marketId: MARKET_ID,
        amount: { amountRaw: '1' },
      },
      {
        action: 'repay',
        marketId: MARKET_ID,
        amount: { amountRaw: '1' },
      },
    ]
    for (const c of cases) {
      const result = QuoteBodySchema.safeParse(c)
      expect(result.success, JSON.stringify(c)).toBe(true)
    }
  })
})
