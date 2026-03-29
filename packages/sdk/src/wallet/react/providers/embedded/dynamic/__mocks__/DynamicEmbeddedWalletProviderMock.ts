import type { LocalAccount } from 'viem'
import { unichain } from 'viem/op-stack'
import { vi } from 'vitest'

import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { EmbeddedWalletProvider } from '@/wallet/core/providers/embedded/abstract/EmbeddedWalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type {
  DynamicEmbeddedWalletToActionsWalletOptions,
  ReactToActionsOptionsMap,
} from '@/wallet/react/providers/embedded/types/index.js'

/**
 * Minimal mock implementation matching the shape of EmbeddedWalletProvider<'dynamic'>
 * for use in unit tests without importing browser-only dependencies.
 */
export class DynamicEmbeddedWalletProviderMock extends EmbeddedWalletProvider<
  'dynamic',
  ReactToActionsOptionsMap
> {
  // Exposed mock for assertions if needed
  public readonly toActionsWalletMock = vi.fn(
    async (
      _params: DynamicEmbeddedWalletToActionsWalletOptions,
    ): Promise<Wallet> => {
      return {} as unknown as Wallet
    },
  )

  public readonly createSignerMock = vi.fn(
    async (
      _params: DynamicEmbeddedWalletToActionsWalletOptions,
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

  async toActionsWallet(
    params: DynamicEmbeddedWalletToActionsWalletOptions,
  ): Promise<Wallet> {
    return this.toActionsWalletMock(params)
  }

  async createSigner(
    params: DynamicEmbeddedWalletToActionsWalletOptions,
  ): Promise<LocalAccount> {
    return this.createSignerMock(params)
  }
}
