import { vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type { DynamicHostedWalletToActionsWalletOptions } from '@/wallet/react/providers/hosted/types/index.js'

/**
 * Minimal mock for DynamicWallet used in React tests
 * @description
 * Provides a static `create` spy that returns a stubbed `Wallet`, avoiding
 * browser-only dependencies. Use with `vi.mock` to replace the real module.
 */
export class DynamicWalletMock {
  static readonly create = vi.fn(
    async (_params: {
      chainManager: ChainManager
      dynamicWallet: DynamicHostedWalletToActionsWalletOptions['wallet']
    }): Promise<Wallet> => {
      return {} as unknown as Wallet
    },
  )
}
