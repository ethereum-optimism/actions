import type { LocalAccount } from 'node_modules/viem/_types/accounts/types.js'
import { unichain } from 'viem/op-stack'
import { vi } from 'vitest'

import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type {
  PrivyHostedWalletToActionsWalletOptions,
  ReactToActionsOptionsMap,
} from '@/wallet/react/providers/hosted/types/index.js'

/**
 * Minimal mock implementation matching the shape of HostedWalletProvider<'privy'>
 * for use in unit tests without importing browser-only dependencies.
 */
export class PrivyHostedWalletProviderMock extends HostedWalletProvider<
  'privy',
  ReactToActionsOptionsMap
> {
  public readonly toActionsWalletMock = vi.fn(
    async (
      _params: PrivyHostedWalletToActionsWalletOptions,
    ): Promise<Wallet> => {
      return {} as unknown as Wallet
    },
  )

  public readonly createSignerMock = vi.fn(
    async (
      _params: PrivyHostedWalletToActionsWalletOptions,
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
    params: PrivyHostedWalletToActionsWalletOptions,
  ): Promise<Wallet> {
    return this.toActionsWalletMock(params)
  }

  async createSigner(
    params: PrivyHostedWalletToActionsWalletOptions,
  ): Promise<LocalAccount> {
    return this.createSignerMock(params)
  }
}
