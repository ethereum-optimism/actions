import type { Address } from 'viem'
import { type MockedFunction, vi } from 'vitest'

import type {
  BaseLendConfig,
  LendMarket,
  LendMarketId,
  LendOptions,
  LendTransaction,
} from '@/types/lend.js'

import { LendProvider } from '../lend/provider.js'

export interface MockLendProviderConfig {
  supportedNetworks: number[]
  defaultApy: number
  mockBalance: bigint
}

/**
 * Mock Lend Provider for testing
 * @description Provides a mock implementation of LendProvider following MockChainManager pattern
 */
export class MockLendProvider extends LendProvider {
  protected readonly SUPPORTED_NETWORKS = {
    TESTNET: {
      chainId: 999,
      name: 'Test Network',
    },
  }
  public lend: MockedFunction<
    (
      asset: Address,
      amount: bigint,
      marketId?: string,
      options?: LendOptions,
    ) => Promise<LendTransaction>
  >
  public deposit: MockedFunction<
    (
      asset: Address,
      amount: bigint,
      marketId?: string,
      options?: LendOptions,
    ) => Promise<LendTransaction>
  >
  public getMarket: MockedFunction<
    (marketId: LendMarketId) => Promise<LendMarket>
  >
  public getMarkets: MockedFunction<() => Promise<LendMarket[]>>
  public getMarketBalance: MockedFunction<
    (
      marketAddress: Address,
      walletAddress: Address,
    ) => Promise<{
      balance: bigint
      balanceFormatted: string
      shares: bigint
      sharesFormatted: string
      chainId: number
    }>
  >
  public withdraw: MockedFunction<
    (
      asset: Address,
      amount: bigint,
      marketId?: string,
      options?: LendOptions,
    ) => Promise<LendTransaction>
  >

  private mockConfig: MockLendProviderConfig

  constructor(
    config?: BaseLendConfig,
    mockConfig?: Partial<MockLendProviderConfig>,
  ) {
    super(config || {})

    this.mockConfig = {
      supportedNetworks: mockConfig?.supportedNetworks ?? [999],
      defaultApy: mockConfig?.defaultApy ?? 0.05,
      mockBalance: mockConfig?.mockBalance ?? 1000000n,
    }

    // Create mocked functions with default implementations
    this.lend = vi.fn().mockImplementation(this.createMockLendTransaction.bind(this))
    this.deposit = vi.fn().mockImplementation(this.createMockLendTransaction.bind(this))
    this.getMarket = vi.fn().mockImplementation(this.createMockMarket.bind(this))
    this.getMarkets = vi.fn().mockImplementation(this.createMockMarkets.bind(this))
    this.getMarketBalance = vi.fn().mockImplementation(this.createMockBalance.bind(this))
    this.withdraw = vi.fn().mockImplementation(this.createMockWithdraw.bind(this))
  }

  private async createMockLendTransaction(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    return {
      amount,
      asset,
      marketId: marketId || 'mock-market',
      apy: this.mockConfig.defaultApy,
      timestamp: Math.floor(Date.now() / 1000),
      slippage: options?.slippage || this.defaultSlippage,
      transactionData: {
        approval: {
          to: asset,
          data: '0x095ea7b3' as Address,
          value: 0n,
        },
        deposit: {
          to: (marketId as Address) || ('0x1234567890123456789012345678901234567890' as Address),
          data: '0x6e553f65' as Address,
          value: 0n,
        },
      },
    }
  }

  private async createMockMarket(marketId: LendMarketId): Promise<LendMarket> {
    return {
      chainId: marketId.chainId,
      address: marketId.address,
      name: 'Mock Market',
      asset: '0x0000000000000000000000000000000000000001' as Address,
      totalAssets: this.mockConfig.mockBalance,
      totalShares: this.mockConfig.mockBalance,
      apy: this.mockConfig.defaultApy,
      apyBreakdown: {
        nativeApy: this.mockConfig.defaultApy * 0.8,
        totalRewardsApr: this.mockConfig.defaultApy * 0.2,
        performanceFee: 0.1,
        netApy: this.mockConfig.defaultApy,
      },
      owner: '0x0000000000000000000000000000000000000002' as Address,
      curator: '0x0000000000000000000000000000000000000003' as Address,
      fee: 10,
      lastUpdate: Math.floor(Date.now() / 1000),
    }
  }

  private async createMockMarkets(): Promise<LendMarket[]> {
    return [
      await this.createMockMarket({
        address: '0x1234567890123456789012345678901234567890' as Address,
        chainId: 999,
      }),
    ]
  }

  private async createMockBalance(
    marketAddress: Address,
    walletAddress: Address,
  ): Promise<{
    balance: bigint
    balanceFormatted: string
    shares: bigint
    sharesFormatted: string
    chainId: number
  }> {
    return {
      balance: this.mockConfig.mockBalance / 2n,
      balanceFormatted: (this.mockConfig.mockBalance / 2n).toString(),
      shares: this.mockConfig.mockBalance / 2n,
      sharesFormatted: (this.mockConfig.mockBalance / 2n).toString(),
      chainId: 999,
    }
  }

  private async createMockWithdraw(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    return {
      amount,
      asset,
      marketId: marketId || 'mock-market',
      apy: 0,
      timestamp: Math.floor(Date.now() / 1000),
      slippage: options?.slippage || this.defaultSlippage,
      transactionData: {
        deposit: {
          to: (marketId as Address) || ('0x1234567890123456789012345678901234567890' as Address),
          data: '0xb460af94' as Address,
          value: 0n,
        },
      },
    }
  }

  /**
   * Helper method to configure mock responses
   */
  configureMock(config: {
    lendResponse?: LendTransaction
    marketResponse?: LendMarket
    marketsResponse?: LendMarket[]
    balanceResponse?: {
      balance: bigint
      balanceFormatted: string
      shares: bigint
      sharesFormatted: string
      chainId: number
    }
  }) {
    if (config.lendResponse) {
      this.lend.mockResolvedValue(config.lendResponse)
      this.deposit.mockResolvedValue(config.lendResponse)
    }
    if (config.marketResponse) {
      this.getMarket.mockResolvedValue(config.marketResponse)
    }
    if (config.marketsResponse) {
      this.getMarkets.mockResolvedValue(config.marketsResponse)
    }
    if (config.balanceResponse) {
      this.getMarketBalance.mockResolvedValue(config.balanceResponse)
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
    this.lend.mockImplementation(this.createMockLendTransaction.bind(this))
    this.deposit.mockImplementation(this.createMockLendTransaction.bind(this))
    this.getMarket.mockImplementation(this.createMockMarket.bind(this))
    this.getMarkets.mockImplementation(this.createMockMarkets.bind(this))
    this.getMarketBalance.mockImplementation(this.createMockBalance.bind(this))
    this.withdraw.mockImplementation(this.createMockWithdraw.bind(this))
  }

  reset(): void {
    vi.clearAllMocks()
    this.resetMocks()
  }
}

/**
 * Create a mock lend provider
 * @param config - Optional configuration for the mock
 * @returns MockLendProvider instance
 */
export function createMockLendProvider(
  config?: BaseLendConfig,
  mockConfig?: Partial<MockLendProviderConfig>,
): MockLendProvider {
  return new MockLendProvider(config, mockConfig)
}
