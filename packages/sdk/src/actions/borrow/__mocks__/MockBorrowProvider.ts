import { type MockedFunction, vi } from 'vitest'

import { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import {
  requireAllowlistedBorrowMarketConfig,
  validateBorrowWalletAddress,
} from '@/actions/borrow/core/validations.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { BorrowProviderConfig } from '@/types/actions.js'
import type {
  BorrowClosePositionInternalParams,
  BorrowClosePositionParams,
  BorrowDepositCollateralInternalParams,
  BorrowDepositCollateralParams,
  BorrowMarket,
  BorrowMarketConfig,
  BorrowMarketId,
  BorrowMarketPosition,
  BorrowOpenPositionInternalParams,
  BorrowOpenPositionParams,
  BorrowQuote,
  BorrowRepayInternalParams,
  BorrowRepayParams,
  BorrowWithdrawCollateralInternalParams,
  BorrowWithdrawCollateralParams,
  GetBorrowMarketParams,
  GetBorrowMarketsParams,
  GetBorrowPositionParams,
} from '@/types/borrow/index.js'
import { validateChainSupported } from '@/utils/validation.js'

export interface MockBorrowProviderConfig {
  supportedChains: number[]
  defaultBorrowApy: number
  defaultLiquidationBonus: number
  defaultMaxLtv: number
  defaultMockBalance: bigint
}

/**
 * Deterministic, mockable `BorrowProvider` for backend / namespace tests.
 * @description Mirrors `MockLendProvider`. Every public method is a
 * `vi.fn()` wrapper around a default implementation so tests can override
 * any method per-call via `.mockResolvedValue(...)` / `.mockRejectedValue(...)`.
 */
export class MockBorrowProvider extends BorrowProvider<BorrowProviderConfig> {
  public openPosition: MockedFunction<
    (params: BorrowOpenPositionParams) => Promise<BorrowQuote>
  >
  public closePosition: MockedFunction<
    (params: BorrowClosePositionParams) => Promise<BorrowQuote>
  >
  public depositCollateral: MockedFunction<
    (params: BorrowDepositCollateralParams) => Promise<BorrowQuote>
  >
  public withdrawCollateral: MockedFunction<
    (params: BorrowWithdrawCollateralParams) => Promise<BorrowQuote>
  >
  public repay: MockedFunction<
    (params: BorrowRepayParams) => Promise<BorrowQuote>
  >
  public getMarket: MockedFunction<
    (params: GetBorrowMarketParams) => Promise<BorrowMarket>
  >
  public getMarkets: MockedFunction<
    (params?: GetBorrowMarketsParams) => Promise<BorrowMarket[]>
  >
  public getPosition: MockedFunction<
    (params: GetBorrowPositionParams) => Promise<BorrowMarketPosition>
  >

  private readonly mockConfig: MockBorrowProviderConfig

  constructor(
    config?: BorrowProviderConfig,
    mockConfig?: Partial<MockBorrowProviderConfig>,
    chainManager?: ChainManager,
  ) {
    super(
      config ?? {},
      chainManager ??
        (new MockChainManager({
          supportedChains: [84532],
        }) as unknown as ChainManager),
    )

    this.mockConfig = {
      supportedChains: mockConfig?.supportedChains ?? [84532],
      defaultBorrowApy: mockConfig?.defaultBorrowApy ?? 0.05,
      defaultLiquidationBonus: mockConfig?.defaultLiquidationBonus ?? 0.05,
      defaultMaxLtv: mockConfig?.defaultMaxLtv ?? 0.86,
      defaultMockBalance: mockConfig?.defaultMockBalance ?? 0n,
    }

    this.openPosition = vi
      .fn()
      .mockImplementation(this.defaultAction.bind(this, 'open'))
    this.closePosition = vi
      .fn()
      .mockImplementation(this.defaultAction.bind(this, 'close'))
    this.depositCollateral = vi
      .fn()
      .mockImplementation(this.defaultAction.bind(this, 'depositCollateral'))
    this.withdrawCollateral = vi
      .fn()
      .mockImplementation(this.defaultAction.bind(this, 'withdrawCollateral'))
    this.repay = vi
      .fn()
      .mockImplementation(this.defaultAction.bind(this, 'repay'))
    this.getMarket = vi
      .fn()
      .mockImplementation(this.defaultGetMarket.bind(this))
    this.getMarkets = vi
      .fn()
      .mockImplementation(this.defaultGetMarkets.bind(this))
    this.getPosition = vi
      .fn()
      .mockImplementation(this.defaultGetPosition.bind(this))
  }

  protocolSupportedChainIds(): number[] {
    return this.mockConfig.supportedChains
  }

  // Concrete `_*` hooks are unused in mocks (public methods are overridden
  // above), but the abstract base demands them.
  protected async _openPosition(
    _: BorrowOpenPositionInternalParams,
  ): Promise<BorrowQuote> {
    throw new Error('MockBorrowProvider._openPosition should not be called')
  }
  protected async _closePosition(
    _: BorrowClosePositionInternalParams,
  ): Promise<BorrowQuote> {
    throw new Error('MockBorrowProvider._closePosition should not be called')
  }
  protected async _depositCollateral(
    _: BorrowDepositCollateralInternalParams,
  ): Promise<BorrowQuote> {
    throw new Error(
      'MockBorrowProvider._depositCollateral should not be called',
    )
  }
  protected async _withdrawCollateral(
    _: BorrowWithdrawCollateralInternalParams,
  ): Promise<BorrowQuote> {
    throw new Error(
      'MockBorrowProvider._withdrawCollateral should not be called',
    )
  }
  protected async _repay(_: BorrowRepayInternalParams): Promise<BorrowQuote> {
    throw new Error('MockBorrowProvider._repay should not be called')
  }
  protected async _getMarket(_: BorrowMarketConfig): Promise<BorrowMarket> {
    throw new Error('MockBorrowProvider._getMarket should not be called')
  }
  protected async _getMarkets(
    _: GetBorrowMarketsParams,
  ): Promise<BorrowMarket[]> {
    throw new Error('MockBorrowProvider._getMarkets should not be called')
  }
  protected async _getPosition(_: {
    market: BorrowMarketConfig
    walletAddress: `0x${string}`
  }): Promise<BorrowMarketPosition> {
    throw new Error('MockBorrowProvider._getPosition should not be called')
  }

  private defaultGetMarket(
    params: GetBorrowMarketParams,
  ): Promise<BorrowMarket> {
    const config = this.findConfig(params)
    return Promise.resolve(this.buildMarket(config, params))
  }

  private defaultGetMarkets(
    params: GetBorrowMarketsParams = {},
  ): Promise<BorrowMarket[]> {
    const configs = params.markets ?? this._config.marketAllowlist ?? []
    return Promise.resolve(
      configs.map((config) =>
        this.buildMarket(config, {
          kind: config.kind,
          marketId: config.marketId,
          chainId: config.chainId,
        }),
      ),
    )
  }

  private defaultGetPosition(
    params: GetBorrowPositionParams,
  ): Promise<BorrowMarketPosition> {
    validateBorrowWalletAddress(params.walletAddress)
    const config = this.findConfig(params.marketId)
    return Promise.resolve(this.emptyPosition(config))
  }

  private defaultAction(
    action: BorrowQuote['action'],
    params: {
      market: BorrowMarketConfig
      walletAddress?: `0x${string}`
    },
  ): Promise<BorrowQuote> {
    validateBorrowWalletAddress(params.walletAddress)
    const config = this.findConfig(params.market)
    const now = Math.floor(Date.now() / 1000)
    const position = this.emptyPosition(config)
    return Promise.resolve({
      marketId: {
        kind: config.kind,
        marketId: config.marketId,
        chainId: config.chainId,
      },
      action,
      positionBefore: null,
      positionAfter: position,
      fees: {
        borrowApy: this.mockConfig.defaultBorrowApy,
        liquidationBonus: this.mockConfig.defaultLiquidationBonus,
      },
      safeCeilingLtv: this.mockConfig.defaultMaxLtv * 0.95,
      execution: { transactions: [] },
      provider: 'morpho',
      quotedAt: now,
      expiresAt: now + this.quoteExpirationSeconds,
    })
  }

  private findConfig(marketId: BorrowMarketId): BorrowMarketConfig {
    validateChainSupported(marketId.chainId, this.supportedChainIds())
    return requireAllowlistedBorrowMarketConfig(marketId, this._config)
  }

  private buildMarket(
    config: BorrowMarketConfig,
    marketId: BorrowMarketId,
  ): BorrowMarket {
    return {
      marketId: {
        kind: marketId.kind,
        marketId: marketId.marketId,
        chainId: marketId.chainId,
      },
      name: config.name,
      collateralAsset: config.collateralAsset,
      borrowAsset: config.borrowAsset,
      borrowApy: this.mockConfig.defaultBorrowApy,
      liquidationBonus: this.mockConfig.defaultLiquidationBonus,
      maxLtv: this.mockConfig.defaultMaxLtv,
      healthBufferPct: this.resolveHealthBufferPct(config),
      totalBorrowed: this.mockConfig.defaultMockBalance,
      totalCollateral: this.mockConfig.defaultMockBalance,
    }
  }

  private emptyPosition(config: BorrowMarketConfig): BorrowMarketPosition {
    return {
      marketId: {
        kind: config.kind,
        marketId: config.marketId,
        chainId: config.chainId,
      },
      collateralAsset: config.collateralAsset,
      collateralAmount: 0n,
      collateralAmountFormatted: '0',
      borrowAsset: config.borrowAsset,
      borrowAmount: 0n,
      borrowAmountFormatted: '0',
      healthFactor: null,
      liquidationPrice: 0n,
      liquidationPriceFormatted: '0',
      borrowApy: this.mockConfig.defaultBorrowApy,
      liquidationBonus: this.mockConfig.defaultLiquidationBonus,
      ltv: null,
      maxLtv: this.mockConfig.defaultMaxLtv,
    }
  }
}
