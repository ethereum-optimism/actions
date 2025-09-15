import type { Address } from 'viem'
import { vi } from 'vitest'

import type {
  LendOptions,
  LendProvider,
  LendTransaction,
} from '@/types/lend.js'

/**
 * Mock Lend Provider for testing
 * @description Provides a mock implementation of LendProvider for testing purposes
 */
export class MockLendProvider {
  public deposit = vi.fn()
  public getMarkets = vi.fn()
  public getMarket = vi.fn()
  public getMarketBalance = vi.fn()
  public supportedNetworkIds = vi.fn()
  public lend = vi.fn()
  public withdraw = vi.fn()

  constructor(config?: {
    defaultHash?: string
    defaultAmount?: bigint
    defaultApy?: number
  }) {
    const {
      defaultHash = '0xabc',
      defaultAmount = 1000000n,
      defaultApy = 0.05,
    } = config || {}

    this.deposit.mockImplementation(
      async (
        asset: Address,
        amount: bigint,
        marketId?: string,
        options?: LendOptions,
      ): Promise<LendTransaction> => {
        return {
          hash: defaultHash,
          amount: amount || defaultAmount,
          asset,
          marketId: marketId || 'default-market',
          apy: defaultApy,
          timestamp: Date.now(),
          transactionData: {
            deposit: {
              to: asset,
              value: 0n,
              data: '0x',
            },
          },
          slippage: options?.slippage || 50,
        }
      },
    )

    this.getMarkets.mockImplementation(async () => {
      return []
    })

    this.getMarket.mockImplementation(async () => {
      return {
        chainId: 130,
        address: '0x123',
        name: 'Mock Vault',
        asset: '0x456',
        totalAssets: BigInt('1000000'),
        totalShares: BigInt('1000000'),
        apy: defaultApy,
        apyBreakdown: {},
        owner: '0x789',
        curator: '0xabc',
        fee: 0.1,
        lastUpdate: Date.now(),
      }
    })

    this.getMarketBalance.mockImplementation(async () => {
      return {
        balance: BigInt('500000'),
        balanceFormatted: '0.5',
        shares: BigInt('500000'),
        sharesFormatted: '0.5',
        chainId: 130,
      }
    })

    this.lend.mockImplementation(
      async (
        asset: Address,
        amount: bigint,
        marketId?: string,
        options?: LendOptions,
      ): Promise<LendTransaction> => {
        return {
          amount: amount || defaultAmount,
          asset,
          marketId: marketId || 'default-market',
          apy: defaultApy,
          timestamp: Date.now(),
          transactionData: {
            deposit: {
              to: asset,
              value: 0n,
              data: '0x',
            },
          },
          slippage: options?.slippage || 50,
        }
      },
    )

    this.withdraw.mockImplementation(
      async (
        asset: Address,
        amount: bigint,
        marketId?: string,
        options?: LendOptions,
      ): Promise<LendTransaction> => {
        return {
          amount: amount || defaultAmount,
          asset,
          marketId: marketId || 'default-market',
          apy: defaultApy,
          timestamp: Date.now(),
          transactionData: {
            deposit: {
              to: asset,
              value: 0n,
              data: '0x',
            },
          },
          slippage: options?.slippage || 50,
        }
      },
    )

    this.supportedNetworkIds.mockImplementation(() => {
      return [130]
    })
  }

  reset(): void {
    vi.clearAllMocks()
  }
}

/**
 * Create a mock lend provider
 * @param config - Optional configuration for the mock
 * @returns MockLendProvider instance
 */
export function createMockLendProvider(config?: {
  defaultHash?: string
  defaultAmount?: bigint
  defaultApy?: number
}): LendProvider {
  return new MockLendProvider(config) as unknown as LendProvider
}
