import type { Address } from 'viem'
import { type MockedFunction, vi } from 'vitest'

import { LendProvider } from '@/lend/core/LendProvider.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import type { LendProviderConfig } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type {
  ClosePositionParams,
  GetLendMarketParams,
  GetLendMarketsParams,
  GetMarketBalanceParams,
  LendClosePositionParams,
  LendMarket,
  LendMarketId,
  LendMarketPosition,
  LendOpenPositionInternalParams,
  LendOpenPositionParams,
  LendOptions,
  LendTransaction,
} from '@/types/lend/index.js'

export interface MockLendProviderConfig {
  supportedChains: number[]
  defaultApy: number
  mockBalance: bigint
}

/**
 * Mock Lend Provider for testing
 * @description Provides a mock implementation of LendProvider following MockChainManager pattern
 */
export class MockLendProvider extends LendProvider<LendProviderConfig> {
  public openPosition: MockedFunction<
    (params: LendOpenPositionParams) => Promise<LendTransaction>
  >
  public getMarket: MockedFunction<
    (params: GetLendMarketParams) => Promise<LendMarket>
  >
  public getMarkets: MockedFunction<
    (params?: GetLendMarketsParams) => Promise<LendMarket[]>
  >
  public getPosition: MockedFunction<
    (
      walletAddress: Address,
      marketId?: LendMarketId,
      asset?: Asset,
    ) => Promise<LendMarketPosition>
  >
  public closePosition: MockedFunction<
    (closePositionParams: ClosePositionParams) => Promise<LendTransaction>
  >
  public withdraw: MockedFunction<
    (
      asset: Address,
      amount: bigint,
      chainId: number,
      marketId?: string,
      options?: LendOptions,
    ) => Promise<LendTransaction>
  >

  protected readonly SUPPORTED_CHAIN_IDS = [1, 130, 8453, 84532] as const

  protected readonly SUPPORTED_CHAINS = {
    TESTNET: {
      chainId: 84532,
      name: 'Test Chain',
    },
  }

  private mockConfig: MockLendProviderConfig

  constructor(
    config?: LendProviderConfig,
    mockConfig?: Partial<MockLendProviderConfig>,
    chainManager?: ChainManager,
  ) {
    super(
      config || {},
      chainManager || (new MockChainManager() as unknown as ChainManager),
    )

    this.mockConfig = {
      supportedChains: mockConfig?.supportedChains ?? [84532],
      defaultApy: mockConfig?.defaultApy ?? 0.05,
      mockBalance: mockConfig?.mockBalance ?? 1000000n,
    }

    // Create mocked functions with default implementations
    this.openPosition = vi
      .fn()
      .mockImplementation(this.createMockOpenPosition.bind(this))
    this.getMarket = vi
      .fn()
      .mockImplementation(({ address, chainId }: GetLendMarketParams) => {
        return this.createMockMarket({ address, chainId })
      })
    this.getMarkets = vi
      .fn()
      .mockImplementation(this.createMockMarkets.bind(this))
    this.getPosition = vi
      .fn()
      .mockImplementation(this.createMockPosition.bind(this))
    this.closePosition = vi
      .fn()
      .mockImplementation(this.createMockClosePosition.bind(this))
    this.withdraw = vi
      .fn()
      .mockImplementation(this.createMockWithdraw.bind(this))
  }

  /**
   * Helper method to configure mock responses
   */
  configureMock(config: {
    openPositionResponse?: LendTransaction
    marketResponse?: LendMarket
    marketsResponse?: LendMarket[]
    balanceResponse?: LendMarketPosition
  }) {
    if (config.openPositionResponse) {
      this.openPosition.mockResolvedValue(config.openPositionResponse)
    }
    if (config.marketResponse) {
      this.getMarket.mockResolvedValue(config.marketResponse)
    }
    if (config.marketsResponse) {
      this.getMarkets.mockResolvedValue(config.marketsResponse)
    }
    if (config.balanceResponse) {
      this.getPosition.mockResolvedValue(config.balanceResponse)
    }
  }

  /**
   * Helper method to simulate errors
   */
  simulateError(method: keyof MockLendProvider, error: Error) {
    const mockMethod = this[method] as MockedFunction<any>
    if (mockMethod && typeof mockMethod.mockRejectedValue === 'function') {
      mockMethod.mockRejectedValue(error)
    }
  }

  /**
   * Reset all mocks to their default implementations
   */
  resetMocks() {
    this.openPosition.mockImplementation(this.createMockOpenPosition.bind(this))
    this.getMarket.mockImplementation(
      ({ address, chainId }: GetLendMarketParams) => {
        return this.createMockMarket({ address, chainId })
      },
    )
    this.getMarkets.mockImplementation(this.createMockMarkets.bind(this))
    this.getPosition.mockImplementation(this.createMockPosition.bind(this))
    this.closePosition.mockImplementation(
      this.createMockClosePosition.bind(this),
    )
    this.withdraw.mockImplementation(this.createMockWithdraw.bind(this))
  }

  reset(): void {
    vi.clearAllMocks()
    this.resetMocks()
  }

  protected async _openPosition(
    params: LendOpenPositionInternalParams,
  ): Promise<LendTransaction> {
    return this.createMockOpenPositionInternal(params)
  }

  protected async _getMarket(marketId: LendMarketId): Promise<LendMarket> {
    return this.createMockMarket(marketId)
  }

  protected async _getMarkets(
    _params: GetLendMarketsParams,
  ): Promise<LendMarket[]> {
    return this.createMockMarkets()
  }

  protected async _getPosition(
    params: GetMarketBalanceParams,
  ): Promise<LendMarketPosition> {
    return this.createMockPosition(params.walletAddress, params.marketId)
  }

  protected async _closePosition(
    params: LendClosePositionParams,
  ): Promise<LendTransaction> {
    const assetAddress = params.asset?.address[params.marketId.chainId]
    if (!assetAddress) {
      throw new Error(`Asset not supported on chain ${params.marketId.chainId}`)
    }

    return this.createMockWithdraw(
      assetAddress,
      params.amount,
      params.marketId.chainId,
      params.marketId.address,
      params.options,
    )
  }

  private async createMockOpenPosition({
    amount,
    asset,
    marketId,
    options,
  }: LendOpenPositionParams): Promise<LendTransaction> {
    // Get asset address for the chain
    const assetAddress = asset.address[marketId.chainId]
    if (!assetAddress) {
      throw new Error(`Asset not supported on chain ${marketId.chainId}`)
    }

    // Convert human-readable amount to wei (mock conversion)
    const amountWei = BigInt(Math.floor(amount * 10 ** asset.metadata.decimals))

    return {
      amount: amountWei,
      asset: assetAddress,
      marketId: marketId.address,
      apy: this.mockConfig.defaultApy,
      slippage: options?.slippage ?? 50,
      transactionData: {
        approval: {
          to: assetAddress,
          data: '0x095ea7b3' as Address,
          value: 0n,
        },
        position: {
          to: marketId.address,
          data: '0x6e553f65' as Address,
          value: 0n,
        },
      },
    }
  }

  private async createMockOpenPositionInternal({
    amountWei,
    asset,
    marketId,
    options,
  }: LendOpenPositionInternalParams): Promise<LendTransaction> {
    // Get asset address for the chain
    const assetAddress = asset.address[marketId.chainId]
    if (!assetAddress) {
      throw new Error(`Asset not supported on chain ${marketId.chainId}`)
    }

    return {
      amount: amountWei,
      asset: assetAddress,
      marketId: marketId.address,
      apy: this.mockConfig.defaultApy,
      slippage: options?.slippage ?? 50,
      transactionData: {
        approval: {
          to: assetAddress,
          data: '0x095ea7b3' as Address,
          value: 0n,
        },
        position: {
          to: marketId.address,
          data: '0x6e553f65' as Address,
          value: 0n,
        },
      },
    }
  }

  private async createMockMarket(marketId: LendMarketId): Promise<LendMarket> {
    return {
      marketId,
      name: 'Mock Market',
      asset: {
        address: {
          [marketId.chainId]:
            '0x0000000000000000000000000000000000000001' as Address,
        },
        metadata: {
          symbol: 'MOCK',
          name: 'Mock Token',
          decimals: 18,
        },
        type: 'erc20',
      },
      supply: {
        totalAssets: this.mockConfig.mockBalance,
        totalShares: this.mockConfig.mockBalance,
      },
      apy: {
        total: this.mockConfig.defaultApy,
        native: this.mockConfig.defaultApy * 0.8,
        totalRewards: this.mockConfig.defaultApy * 0.2,
        performanceFee: 0.1,
      },
      metadata: {
        owner: '0x0000000000000000000000000000000000000002' as Address,
        curator: '0x0000000000000000000000000000000000000003' as Address,
        fee: 10,
        lastUpdate: Math.floor(Date.now() / 1000),
      },
    }
  }

  private async createMockMarkets(): Promise<LendMarket[]> {
    return [
      await this.createMockMarket({
        address: '0x1234567890123456789012345678901234567890' as Address,
        chainId: 84532,
      }),
    ]
  }

  private async createMockPosition(
    _walletAddress: Address,
    marketId?: LendMarketId,
    _asset?: Asset,
  ): Promise<LendMarketPosition> {
    if (!marketId) {
      throw new Error('marketId is required for mock position')
    }

    return {
      balance: this.mockConfig.mockBalance / 2n,
      balanceFormatted: (this.mockConfig.mockBalance / 2n).toString(),
      shares: this.mockConfig.mockBalance / 2n,
      sharesFormatted: (this.mockConfig.mockBalance / 2n).toString(),
      marketId,
    }
  }

  private async createMockClosePosition({
    amount,
    asset,
    marketId,
    options,
  }: ClosePositionParams): Promise<LendTransaction> {
    // If asset provided, use its address for the chain; otherwise use a mock asset
    const assetAddress =
      asset?.address[marketId.chainId] ||
      ('0x1234567890123456789012345678901234567890' as Address)

    return {
      amount: BigInt(amount),
      asset: assetAddress,
      marketId: marketId.address,
      apy: 0,
      slippage: options?.slippage ?? 50,
      transactionData: {
        position: {
          to: marketId.address,
          data: '0xb460af94' as Address,
          value: 0n,
        },
      },
    }
  }

  private async createMockWithdraw(
    asset: Address,
    amount: bigint,
    chainId: number,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    return {
      amount,
      asset,
      marketId: marketId || 'mock-market',
      apy: 0,
      slippage: options?.slippage ?? 50,
      transactionData: {
        position: {
          to:
            (marketId as Address) ||
            ('0x1234567890123456789012345678901234567890' as Address),
          data: '0xb460af94' as Address,
          value: 0n,
        },
      },
    }
  }
}

/**
 * Create a mock lend provider
 * @param config - Optional configuration for the mock
 * @returns MockLendProvider instance
 */
export function createMockLendProvider(
  config?: LendProviderConfig,
  mockConfig?: Partial<MockLendProviderConfig>,
): MockLendProvider {
  return new MockLendProvider(config, mockConfig)
}
