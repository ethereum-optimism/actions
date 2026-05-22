import { zeroAddress } from 'viem'
import { baseSepolia } from 'viem/chains'
import { beforeEach, describe, expect, it } from 'vitest'

import { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  AddressRequiredError,
  ChainNotSupportedError,
  MarketNotAllowedError,
  ZeroAddressError,
} from '@/core/error/errors.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { BorrowProviderConfig, BorrowSettings } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type {
  BorrowClosePositionInternalParams,
  BorrowDepositCollateralInternalParams,
  BorrowMarket,
  BorrowMarketConfig,
  BorrowMarketPosition,
  BorrowOpenPositionInternalParams,
  BorrowQuote,
  BorrowRepayInternalParams,
  BorrowWithdrawCollateralInternalParams,
  GetBorrowMarketsParams,
} from '@/types/borrow/index.js'

const BASE_SEPOLIA_ID = baseSepolia.id as SupportedChainId

const usdcMockAddress = '0xb1b0fe886ce376f28987ad24b1759a8f0a7dd839'
const opMockAddress = '0xd6169405013e92387b78457fa77d377ce8cd3ee8'

const collateralAsset: Asset = {
  type: 'erc20',
  address: { [BASE_SEPOLIA_ID]: usdcMockAddress },
  metadata: { symbol: 'dUSDC', name: 'Mock dUSDC', decimals: 18 },
} as unknown as Asset

const borrowAsset: Asset = {
  type: 'erc20',
  address: { [BASE_SEPOLIA_ID]: opMockAddress },
  metadata: { symbol: 'OP', name: 'Mock OP', decimals: 18 },
} as unknown as Asset

const marketHexId =
  '0x1111111111111111111111111111111111111111111111111111111111111111'

const market: BorrowMarketConfig = {
  kind: 'morpho-blue',
  marketId: marketHexId,
  chainId: BASE_SEPOLIA_ID,
  name: 'Test market',
  collateralAsset,
  borrowAsset,
  borrowProvider: 'morpho',
  lendProvider: 'morpho',
  marketParams: {
    loanToken: opMockAddress,
    collateralToken: usdcMockAddress,
    oracle: '0x0000000000000000000000000000000000000001',
    irm: '0x0000000000000000000000000000000000000002',
    lltv: 860000000000000000n,
  },
}

const otherMarket: BorrowMarketConfig = {
  ...market,
  marketId:
    '0x2222222222222222222222222222222222222222222222222222222222222222',
}

class TestProvider extends BorrowProvider<BorrowProviderConfig> {
  public openCalls: BorrowOpenPositionInternalParams[] = []
  public closeCalls: BorrowClosePositionInternalParams[] = []
  public depositCalls: BorrowDepositCollateralInternalParams[] = []
  public withdrawCalls: BorrowWithdrawCollateralInternalParams[] = []
  public repayCalls: BorrowRepayInternalParams[] = []
  public marketCalls: BorrowMarket[] = []

  constructor(
    config: BorrowProviderConfig,
    chainManager: ChainManager,
    settings?: BorrowSettings,
  ) {
    super(config, chainManager, settings)
  }

  protocolSupportedChainIds(): number[] {
    return [BASE_SEPOLIA_ID]
  }

  protected async _openPosition(
    params: BorrowOpenPositionInternalParams,
  ): Promise<BorrowQuote> {
    this.openCalls.push(params)
    return makeStubQuote('open', params.market)
  }

  protected async _closePosition(
    params: BorrowClosePositionInternalParams,
  ): Promise<BorrowQuote> {
    this.closeCalls.push(params)
    return makeStubQuote('close', params.market)
  }

  protected async _depositCollateral(
    params: BorrowDepositCollateralInternalParams,
  ): Promise<BorrowQuote> {
    this.depositCalls.push(params)
    return makeStubQuote('depositCollateral', params.market)
  }

  protected async _withdrawCollateral(
    params: BorrowWithdrawCollateralInternalParams,
  ): Promise<BorrowQuote> {
    this.withdrawCalls.push(params)
    return makeStubQuote('withdrawCollateral', params.market)
  }

  protected async _repay(
    params: BorrowRepayInternalParams,
  ): Promise<BorrowQuote> {
    this.repayCalls.push(params)
    return makeStubQuote('repay', params.market)
  }

  protected async _getMarket(_: BorrowMarketConfig): Promise<BorrowMarket> {
    return makeStubMarket(market)
  }

  protected async _getMarkets(
    params: GetBorrowMarketsParams,
  ): Promise<BorrowMarket[]> {
    return (params.markets ?? []).map((m) => makeStubMarket(m))
  }

  protected async _getPosition(params: {
    market: BorrowMarketConfig
    walletAddress: `0x${string}`
  }): Promise<BorrowMarketPosition> {
    return {
      marketId: params.market,
      collateralAsset,
      collateralShares: 0n,
      collateralSharesFormatted: '0',
      collateralAmount: 0n,
      collateralAmountFormatted: '0',
      borrowAsset,
      borrowAmount: 0n,
      borrowAmountFormatted: '0',
      healthFactor: null,
      liquidationPrice: 0n,
      liquidationPriceFormatted: '0',
      borrowApy: 0,
      liquidationBonus: 0,
      ltv: null,
      maxLtv: 0.86,
    }
  }
}

function makeStubMarket(marketId: BorrowMarketConfig): BorrowMarket {
  return {
    marketId,
    name: marketId.name,
    collateralAsset: marketId.collateralAsset,
    borrowAsset: marketId.borrowAsset,
    borrowApy: 0.05,
    liquidationBonus: 0.05,
    maxLtv: 0.86,
    healthBufferPct: 0.05,
    totalBorrowed: 0n,
    totalCollateral: 0n,
  }
}

function makeStubQuote(
  action: BorrowQuote['action'],
  marketId: BorrowMarketConfig,
): BorrowQuote {
  return {
    marketId,
    action,
    positionBefore: null,
    positionAfter: {
      marketId,
      collateralAsset: marketId.collateralAsset,
      collateralShares: 0n,
      collateralSharesFormatted: '0',
      collateralAmount: 0n,
      collateralAmountFormatted: '0',
      borrowAsset: marketId.borrowAsset,
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
    quotedAt: 0,
    expiresAt: 0,
  }
}

const walletAddress = '0x000000000000000000000000000000000000bEEF' as const

function makeProvider(
  config: BorrowProviderConfig = { marketAllowlist: [market] },
  settings?: BorrowSettings,
) {
  const chainManager = new MockChainManager({
    supportedChains: [BASE_SEPOLIA_ID],
  }) as unknown as ChainManager
  return new TestProvider(config, chainManager, settings)
}

describe('BorrowProvider - settings resolution', () => {
  it('defaults quoteExpirationSeconds to 30', () => {
    const provider = makeProvider()
    expect(provider.quoteExpirationSeconds).toBe(30)
  })

  it('lets provider config override settings.quoteExpirationSeconds', () => {
    const provider = makeProvider(
      { marketAllowlist: [market], quoteExpirationSeconds: 15 },
      { quoteExpirationSeconds: 90 },
    )
    expect(provider.quoteExpirationSeconds).toBe(15)
  })

  it('lets settings.quoteExpirationSeconds win when provider unset', () => {
    const provider = makeProvider(
      { marketAllowlist: [market] },
      { quoteExpirationSeconds: 90 },
    )
    expect(provider.quoteExpirationSeconds).toBe(90)
  })

  it('defaults healthBufferPct to 0.05', () => {
    const provider = makeProvider()
    expect(provider.defaultHealthBufferPct).toBe(0.05)
  })
})

describe('BorrowProvider - chain support', () => {
  it('intersects protocol chains with configured chains', () => {
    const provider = makeProvider()
    expect(provider.supportedChainIds()).toEqual([BASE_SEPOLIA_ID])
    expect(provider.isChainSupported(BASE_SEPOLIA_ID)).toBe(true)
    expect(provider.isChainSupported(1)).toBe(false)
  })
})

describe('BorrowProvider - openPosition', () => {
  it('throws when walletAddress is missing', async () => {
    const provider = makeProvider()
    await expect(
      provider.openPosition({
        market,
        borrowAmount: { amount: 1 },
      }),
    ).rejects.toBeInstanceOf(AddressRequiredError)
  })

  it('normalizes Amount.amount → wei using borrowAsset decimals', async () => {
    const provider = makeProvider()
    await provider.openPosition({
      market,
      walletAddress,
      borrowAmount: { amount: 1.5 },
      collateralAmount: { amount: 100 },
    })
    expect(provider.openCalls).toHaveLength(1)
    const call = provider.openCalls[0]
    expect(call.borrowAmountWei).toBe(1_500_000_000_000_000_000n)
    expect(call.collateralAmountWei).toBe(100_000_000_000_000_000_000n)
    expect(call.walletAddress).toBe(walletAddress)
  })

  it('rejects the zero walletAddress', async () => {
    const provider = makeProvider()
    await expect(
      provider.openPosition({
        market,
        walletAddress: zeroAddress,
        borrowAmount: { amount: 1 },
      }),
    ).rejects.toBeInstanceOf(ZeroAddressError)
  })

  it('passes amountRaw straight through', async () => {
    const provider = makeProvider()
    await provider.openPosition({
      market,
      walletAddress,
      borrowAmount: { amountRaw: 42n },
    })
    expect(provider.openCalls[0].borrowAmountWei).toBe(42n)
    expect(provider.openCalls[0].collateralAmountWei).toBeUndefined()
  })

  it('rejects a market not on the allowlist', async () => {
    const provider = makeProvider({ marketAllowlist: [market] })
    await expect(
      provider.openPosition({
        market: otherMarket,
        walletAddress,
        borrowAmount: { amount: 1 },
      }),
    ).rejects.toBeInstanceOf(MarketNotAllowedError)
  })

  it('rejects a market on the blocklist', async () => {
    const provider = makeProvider({
      marketAllowlist: [market, otherMarket],
      marketBlocklist: [otherMarket],
    })
    await expect(
      provider.openPosition({
        market: otherMarket,
        walletAddress,
        borrowAmount: { amount: 1 },
      }),
    ).rejects.toBeInstanceOf(MarketNotAllowedError)
  })
})

describe('BorrowProvider - closePosition', () => {
  it('rejects the zero walletAddress', async () => {
    const provider = makeProvider()
    await expect(
      provider.closePosition({
        market,
        walletAddress: zeroAddress,
        borrowAmount: { max: true },
      }),
    ).rejects.toBeInstanceOf(ZeroAddressError)
  })

  it('passes { max: true } through to the concrete hook', async () => {
    const provider = makeProvider()
    await provider.closePosition({
      market,
      walletAddress,
      borrowAmount: { max: true },
      collateralAmount: { max: true },
    })
    const call = provider.closeCalls[0]
    expect(call.borrowAmount).toEqual({ max: true })
    expect(call.collateralAmount).toEqual({ max: true })
  })

  it('normalizes mixed sentinel + exact amounts', async () => {
    const provider = makeProvider()
    await provider.closePosition({
      market,
      walletAddress,
      borrowAmount: { max: true },
      collateralAmount: { amount: 5 },
    })
    const call = provider.closeCalls[0]
    expect(call.borrowAmount).toEqual({ max: true })
    expect(call.collateralAmount).toEqual({
      amountWei: 5_000_000_000_000_000_000n,
    })
  })
})

describe('BorrowProvider - single-amount actions', () => {
  it('depositCollateral rejects the zero walletAddress', async () => {
    const provider = makeProvider()
    await expect(
      provider.depositCollateral({
        market,
        walletAddress: zeroAddress,
        amount: { amount: 250 },
      }),
    ).rejects.toBeInstanceOf(ZeroAddressError)
  })

  it('depositCollateral normalizes using collateralAsset decimals', async () => {
    const provider = makeProvider()
    await provider.depositCollateral({
      market,
      walletAddress,
      amount: { amount: 250 },
    })
    expect(provider.depositCalls[0].amountWei).toBe(
      250_000_000_000_000_000_000n,
    )
  })

  it('withdrawCollateral preserves { max: true }', async () => {
    const provider = makeProvider()
    await provider.withdrawCollateral({
      market,
      walletAddress,
      amount: { max: true },
    })
    expect(provider.withdrawCalls[0].amount).toEqual({ max: true })
  })

  it('withdrawCollateral rejects the zero walletAddress', async () => {
    const provider = makeProvider()
    await expect(
      provider.withdrawCollateral({
        market,
        walletAddress: zeroAddress,
        amount: { max: true },
      }),
    ).rejects.toBeInstanceOf(ZeroAddressError)
  })

  it('repay normalizes using borrowAsset decimals', async () => {
    const provider = makeProvider()
    await provider.repay({
      market,
      walletAddress,
      amount: { amount: 0.5 },
    })
    expect(provider.repayCalls[0].amount).toEqual({
      amountWei: 500_000_000_000_000_000n,
    })
  })

  it('repay rejects the zero walletAddress', async () => {
    const provider = makeProvider()
    await expect(
      provider.repay({
        market,
        walletAddress: zeroAddress,
        amount: { amount: 0.5 },
      }),
    ).rejects.toBeInstanceOf(ZeroAddressError)
  })
})

describe('BorrowProvider - getMarket / getMarkets / getPosition', () => {
  let provider: TestProvider

  beforeEach(() => {
    provider = makeProvider()
  })

  it('getMarket rejects an unsupported chain', async () => {
    await expect(
      provider.getMarket({
        kind: 'morpho-blue',
        marketId: marketHexId,
        chainId: 1 as SupportedChainId,
      }),
    ).rejects.toBeInstanceOf(ChainNotSupportedError)
  })

  it('getMarket rejects a market id outside the allowlist', async () => {
    await expect(
      provider.getMarket({
        kind: 'morpho-blue',
        marketId:
          '0x9999999999999999999999999999999999999999999999999999999999999999',
        chainId: BASE_SEPOLIA_ID,
      }),
    ).rejects.toBeInstanceOf(MarketNotAllowedError)
  })

  it('getMarkets filters by chainId from the allowlist', async () => {
    provider = makeProvider({ marketAllowlist: [market, otherMarket] })
    const markets = await provider.getMarkets({ chainId: BASE_SEPOLIA_ID })
    expect(markets).toHaveLength(2)
  })

  it('getMarkets filters by collateralAsset', async () => {
    provider = makeProvider({ marketAllowlist: [market, otherMarket] })
    const markets = await provider.getMarkets({
      collateralAsset,
    })
    expect(markets).toHaveLength(2)
    const noMatch = await provider.getMarkets({
      collateralAsset: borrowAsset, // wrong side on purpose
    })
    expect(noMatch).toHaveLength(0)
  })

  it('getMarkets filters by borrowAsset', async () => {
    provider = makeProvider({ marketAllowlist: [market, otherMarket] })
    const markets = await provider.getMarkets({
      borrowAsset,
    })
    expect(markets).toHaveLength(2)
    const noMatch = await provider.getMarkets({
      borrowAsset: collateralAsset,
    })
    expect(noMatch).toHaveLength(0)
  })

  it('getPosition throws when walletAddress is missing', async () => {
    await expect(
      provider.getPosition({
        marketId: market,
        walletAddress: undefined as unknown as `0x${string}`,
      }),
    ).rejects.toBeInstanceOf(AddressRequiredError)
  })

  it('getPosition rejects the zero walletAddress', async () => {
    await expect(
      provider.getPosition({
        marketId: market,
        walletAddress: zeroAddress,
      }),
    ).rejects.toBeInstanceOf(ZeroAddressError)
  })

  it('getPosition returns the concrete provider result', async () => {
    const position = await provider.getPosition({
      marketId: market,
      walletAddress,
    })
    expect(position.borrowAmount).toBe(0n)
    expect(position.healthFactor).toBeNull()
  })
})
