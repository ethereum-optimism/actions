import type { LocalAccount } from 'viem'
import { unichain } from 'viem/op-stack'
import { vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type {
  DynamicHostedWalletToVerbsWalletOptions,
  ReactToVerbsOptionsMap,
} from '@/wallet/react/providers/hosted/types/index.js'

/**
 * Minimal mock implementation matching the shape of HostedWalletProvider<'dynamic'>
 * for use in unit tests without importing browser-only dependencies.
 */
export class DynamicHostedWalletProviderMock extends HostedWalletProvider<
  'dynamic',
  ReactToVerbsOptionsMap
> {
  // Exposed mock for assertions if needed
  public readonly toVerbsWalletMock = vi.fn(
    async (
      _params: DynamicHostedWalletToVerbsWalletOptions,
    ): Promise<Wallet> => {
      return {} as unknown as Wallet
    },
  )

  public readonly createSignerMock = vi.fn(
    async (
      _params: DynamicHostedWalletToVerbsWalletOptions,
    ): Promise<LocalAccount> => {
      return {} as unknown as LocalAccount
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

  async createSigner(
    params: DynamicHostedWalletToVerbsWalletOptions,
  ): Promise<LocalAccount> {
    return this.createSignerMock(params)
  }
}
