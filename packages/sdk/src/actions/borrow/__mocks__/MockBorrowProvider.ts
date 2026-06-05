import { type MockedFunction, vi } from 'vitest'

import { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import { requireAllowlistedBorrowMarketConfig } from '@/actions/borrow/core/validations.js'
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
  GetBorrowMarketsParams,
  GetBorrowPositionParams,
} from '@/types/borrow/index.js'
import type { BorrowProviderName } from '@/types/providers.js'
import {
  validateChainSupported,
  validateWalletAddress,
} from '@/utils/validation.js'

export interface MockBorrowProviderConfig {
  supportedChains: number[]
  defaultBorrowApy: number
  defaultLiquidationBonus: number
  defaultMaxLtv: number
  defaultMockBalance: bigint
  /** Provider name stamped on mock quotes (e.g. `'morpho'` or `'aave'`). */
  provider: BorrowProviderName
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
    (params: BorrowMarketId) => Promise<BorrowMarket>
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
      provider: mockConfig?.provider ?? 'morpho',
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

  public get marketKind(): BorrowMarketId['kind'] {
    return this.mockConfig.provider === 'aave' ? 'aave-v3' : 'morpho-blue'
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

  private defaultGetMarket(params: BorrowMarketId): Promise<BorrowMarket> {
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
    validateWalletAddress(params.walletAddress)
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
    validateWalletAddress(params.walletAddress)
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
      provider: this.mockConfig.provider,
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
      collateralShares: 0n,
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
