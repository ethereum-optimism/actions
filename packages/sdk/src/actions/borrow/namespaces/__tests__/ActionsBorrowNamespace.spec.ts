import { baseSepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import type { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import { BaseBorrowNamespace } from '@/actions/borrow/namespaces/BaseBorrowNamespace.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { BorrowProviderConfig } from '@/types/actions.js'
import type {
  BorrowMarketConfig,
  BorrowQuote,
  MorphoMarketParams,
} from '@/types/borrow/index.js'

const BASE_SEPOLIA_ID = baseSepolia.id as SupportedChainId
const walletAddress = '0x000000000000000000000000000000000000beef' as const

const collateralAsset = {
  type: 'erc20',
  address: { [BASE_SEPOLIA_ID]: '0xb1b0fe886ce376f28987ad24b1759a8f0a7dd839' },
  metadata: { symbol: 'dUSDC', name: 'dUSDC', decimals: 18 },
} as never

const borrowAsset = {
  type: 'erc20',
  address: { [BASE_SEPOLIA_ID]: '0xd6169405013e92387b78457fa77d377ce8cd3ee8' },
  metadata: { symbol: 'OP', name: 'OP', decimals: 18 },
} as never

const marketParams: MorphoMarketParams = {
  loanToken: '0xd6169405013e92387b78457fa77d377ce8cd3ee8',
  collateralToken: '0xb1b0fe886ce376f28987ad24b1759a8f0a7dd839',
  oracle: '0x0000000000000000000000000000000000000aaa',
  irm: '0x46415998764c29ab2a25cbea6254146d50d22687',
  lltv: 860000000000000000n,
}

const market: BorrowMarketConfig = {
  kind: 'morpho-blue',
  marketId:
    '0x1111111111111111111111111111111111111111111111111111111111111111',
  chainId: BASE_SEPOLIA_ID,
  name: 'Test market',
  collateralAsset,
  borrowAsset,
  borrowProvider: 'morpho',
  lendProvider: 'morpho',
  marketParams,
}

function makeQuote(action: BorrowQuote['action'] = 'open'): BorrowQuote {
  const now = Math.floor(Date.now() / 1000)
  return {
    marketId: {
      kind: market.kind,
      marketId: market.marketId,
      chainId: market.chainId,
    },
    action,
    positionBefore: null,
    positionAfter: {
      marketId: {
        kind: market.kind,
        marketId: market.marketId,
        chainId: market.chainId,
      },
      collateralAsset,
      collateralAmount: 0n,
      collateralAmountFormatted: '0',
      borrowAsset,
      borrowAmount: 0n,
      borrowAmountFormatted: '0',
      healthFactor: null,
      liquidationPrice: 0n,
      liquidationPriceFormatted: '0',
      borrowApy: 0.05,
      liquidationBonus: 0.05,
      ltv: null,
      maxLtv: 0.86,
    },
    fees: { borrowApy: 0.05, liquidationBonus: 0.05 },
    safeCeilingLtv: 0.86 * 0.95,
    execution: { transactions: [] },
    provider: 'morpho',
    quotedAt: now,
    expiresAt: now + 30,
  }
}

function makeProvider() {
  return {
    config: { marketAllowlist: [market] },
    supportedChainIds: () => [BASE_SEPOLIA_ID],
    isChainSupported: () => true,
    openPosition: vi.fn(async () => makeQuote('open')),
    closePosition: vi.fn(async () => makeQuote('close')),
    depositCollateral: vi.fn(async () => makeQuote('depositCollateral')),
    withdrawCollateral: vi.fn(async () => makeQuote('withdrawCollateral')),
    repay: vi.fn(async () => makeQuote('repay')),
    getMarket: vi.fn(),
    getMarkets: vi.fn(),
    getPosition: vi.fn(),
  } as unknown as BorrowProvider<BorrowProviderConfig>
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
    ;(okProvider.getMarkets as ReturnType<typeof vi.fn>).mockResolvedValue([
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
    ;(failingProvider.getMarkets as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('rpc failed'),
    )

    const ns = new BaseBorrowNamespace({
      morpho: okProvider,
      spark: failingProvider,
    } as never)

    const markets = await ns.getMarkets()

    expect(markets).toHaveLength(1)
    expect(markets[0].name).toBe(market.name)
  })
})
