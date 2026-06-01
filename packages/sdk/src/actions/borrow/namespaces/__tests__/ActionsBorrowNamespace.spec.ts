import { describe, expect, it } from 'vitest'

import { MockBorrowProvider } from '@/actions/borrow/__mocks__/MockBorrowProvider.js'
import {
  borrowAsset,
  collateralAsset,
  makeBorrowQuote,
  market,
  walletAddress,
} from '@/actions/borrow/__tests__/fixtures.js'
import { BaseBorrowNamespace } from '@/actions/borrow/namespaces/BaseBorrowNamespace.js'
import type { BorrowQuote } from '@/types/borrow/index.js'

function makeQuote(action: BorrowQuote['action'] = 'open'): BorrowQuote {
  return makeBorrowQuote({ action })
}

function makeProvider(): MockBorrowProvider {
  const provider = new MockBorrowProvider({ marketAllowlist: [market] })
  provider.openPosition.mockResolvedValue(makeQuote('open'))
  provider.closePosition.mockResolvedValue(makeQuote('close'))
  provider.depositCollateral.mockResolvedValue(makeQuote('depositCollateral'))
  provider.withdrawCollateral.mockResolvedValue(makeQuote('withdrawCollateral'))
  provider.repay.mockResolvedValue(makeQuote('repay'))
  return provider
}

describe('BaseBorrowNamespace.getQuote', () => {
  it('dispatches to the provider verb that matches the action discriminator', async () => {
    const provider = makeProvider()
    const ns = new BaseBorrowNamespace({ morpho: provider })
    const quote = await ns.getQuote({
      action: 'depositCollateral',
      market,
      walletAddress,
      amount: { amountRaw: 1n },
    })
    expect(quote.action).toBe('depositCollateral')
    expect(provider.depositCollateral).toHaveBeenCalledTimes(1)
    expect(provider.depositCollateral).toHaveBeenCalledWith({
      action: 'depositCollateral',
      market,
      walletAddress,
      amount: { amountRaw: 1n },
    })
    expect(provider.openPosition).not.toHaveBeenCalled()
  })

  it('supports the open action with collateral', async () => {
    const provider = makeProvider()
    const ns = new BaseBorrowNamespace({ morpho: provider })
    await ns.getQuote({
      action: 'open',
      market,
      walletAddress,
      borrowAmount: { amountRaw: 1n },
      collateralAmount: { amountRaw: 5n },
    })
    expect(provider.openPosition).toHaveBeenCalledTimes(1)
    expect(provider.openPosition).toHaveBeenCalledWith({
      action: 'open',
      market,
      walletAddress,
      borrowAmount: { amountRaw: 1n },
      collateralAmount: { amountRaw: 5n },
    })
  })

  it('supports max-amount close', async () => {
    const provider = makeProvider()
    const ns = new BaseBorrowNamespace({ morpho: provider })
    await ns.getQuote({
      action: 'close',
      market,
      walletAddress,
      borrowAmount: { max: true },
      collateralAmount: { max: true },
    })
    expect(provider.closePosition).toHaveBeenCalledTimes(1)
    expect(provider.closePosition).toHaveBeenCalledWith({
      action: 'close',
      market,
      walletAddress,
      borrowAmount: { max: true },
      collateralAmount: { max: true },
    })
  })
})

describe('BaseBorrowNamespace.getMarkets', () => {
  it('keeps fulfilled provider results when one provider fails', async () => {
    const okProvider = makeProvider()
    const failingProvider = makeProvider()
    okProvider.getMarkets.mockResolvedValue([
      {
        marketId: {
          kind: market.kind,
          marketId: market.marketId,
          chainId: market.chainId,
        },
        name: market.name,
        collateralAsset,
        borrowAsset,
        borrowApy: 0.05,
        liquidationBonus: 0.05,
        maxLtv: 0.86,
        healthBufferPct: 0.05,
        totalBorrowed: 0n,
        totalCollateral: 0n,
      },
    ])
    failingProvider.getMarkets.mockRejectedValue(new Error('rpc failed'))

    const ns = new BaseBorrowNamespace({
      morpho: okProvider,
      spark: failingProvider,
    } as never)

    const markets = await ns.getMarkets()

    expect(markets).toHaveLength(1)
    expect(markets[0].name).toBe(market.name)
  })
})
