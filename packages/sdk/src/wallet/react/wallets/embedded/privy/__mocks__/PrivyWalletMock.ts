import type { ConnectedWallet } from '@privy-io/react-auth'
import { vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

/**
 * Minimal mock for PrivyWallet used in React tests
 * @description
 * Provides a static `create` spy that returns a stubbed `Wallet`, avoiding
 * browser-only dependencies. Use with `vi.mock` to replace the real module.
 */
export class PrivyWalletMock {
  static readonly create = vi.fn(
    async (_params: {
      chainManager: ChainManager
      connectedWallet: ConnectedWallet
    }): Promise<Wallet> => {
      return {} as unknown as Wallet
    },
  )
}
