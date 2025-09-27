import { unichain } from 'viem/op-stack'
import { vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type {
  PrivyHostedWalletToVerbsWalletOptions,
  ReactToVerbsOptionsMap,
} from '@/wallet/react/providers/hosted/types/index.js'

/**
 * Minimal mock implementation matching the shape of HostedWalletProvider<'privy'>
 * for use in unit tests without importing browser-only dependencies.
 */
export class PrivyHostedWalletProviderMock extends HostedWalletProvider<
  'privy',
  ReactToVerbsOptionsMap
> {
  public readonly toVerbsWalletMock = vi.fn(
    async (_params: PrivyHostedWalletToVerbsWalletOptions): Promise<Wallet> => {
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
    params: PrivyHostedWalletToVerbsWalletOptions,
  ): Promise<Wallet> {
    return this.toVerbsWalletMock(params)
  }
}
