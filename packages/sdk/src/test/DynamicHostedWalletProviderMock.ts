import { unichain } from 'viem/op-stack'
import { vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import type { DynamicHostedWalletToVerbsWalletOptions } from '@/types/wallet.js'
import type { Wallet } from '@/wallet/base/Wallet.js'
import { HostedWalletProvider } from '@/wallet/providers/base/HostedWalletProvider.js'

/**
 * Minimal mock implementation matching the shape of HostedWalletProvider<'dynamic'>
 * for use in unit tests without importing browser-only dependencies.
 */
export class DynamicHostedWalletProviderMock extends HostedWalletProvider<'dynamic'> {
  // Exposed mock for assertions if needed
  public readonly toVerbsWalletMock = vi.fn(
    async (
      _params: DynamicHostedWalletToVerbsWalletOptions,
    ): Promise<Wallet> => {
      return {} as unknown as Wallet
    },
  )

  constructor() {
    const mockChainManager = new MockChainManager({
      supportedChains: [unichain.id],
    }) as unknown as ChainManager
    super(mockChainManager)
  }

  async toVerbsWallet(
    params: DynamicHostedWalletToVerbsWalletOptions,
  ): Promise<Wallet> {
    return this.toVerbsWalletMock(params)
  }
}
