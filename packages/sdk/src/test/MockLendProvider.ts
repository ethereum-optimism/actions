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
