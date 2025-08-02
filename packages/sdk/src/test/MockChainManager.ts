import type { PublicClient } from 'viem'
import { unichain } from 'viem/chains'
import { type MockedFunction, vi } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'

export interface MockChainManagerConfig {
  supportedChains: SupportedChainId[]
  defaultBalance: bigint
  defaultETHBalance: bigint
}

/**
 * Mock ChainManager for testing
 * Provides the same interface as the real ChainManager but with configurable behavior
 */
export class MockChainManager {
  public getSupportedChains: MockedFunction<() => number[]>
  public getPublicClient: MockedFunction<
    (chainId: SupportedChainId) => PublicClient
  >

  private config: MockChainManagerConfig
  private publicClients: Map<SupportedChainId, PublicClient>

  constructor(config?: Partial<MockChainManagerConfig>) {
    this.config = {
      supportedChains: config?.supportedChains ?? [unichain.id],
      defaultBalance: config?.defaultBalance ?? 1000000n,
      defaultETHBalance: config?.defaultETHBalance ?? 1000000000n,
    }

    this.publicClients = this.createMockPublicClients()

    // Create mocked functions
    this.getSupportedChains = vi
      .fn()
      .mockReturnValue(this.config.supportedChains)
    this.getPublicClient = vi
      .fn()
      .mockImplementation((chainId: SupportedChainId) => {
        const client = this.publicClients.get(chainId)
        if (!client) {
          throw new Error(
            `No public client configured for chain ID: ${chainId}`,
          )
        }
        return client
      })
  }

  reset(): void {
    vi.clearAllMocks()
    this.publicClients.forEach((client) => {
      vi.mocked(client.readContract).mockResolvedValue(
        this.config.defaultBalance,
      )
    })
  }

  private createMockPublicClients(): Map<SupportedChainId, PublicClient> {
    const clients = new Map<SupportedChainId, PublicClient>()

    for (const chainId of this.config.supportedChains) {
      const mockClient: PublicClient = {
        chain: { id: chainId },
        readContract: vi.fn().mockImplementation(() => {
          return Promise.resolve(this.config.defaultBalance)
        }),
        getBalance: vi.fn().mockImplementation(() => {
          return Promise.resolve(this.config.defaultBalance)
        }),
      } as any

      clients.set(chainId, mockClient)
    }

    return clients
  }
}
