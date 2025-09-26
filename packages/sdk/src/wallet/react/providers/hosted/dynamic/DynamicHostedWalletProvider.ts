import type { ChainManager } from '@/services/ChainManager.js'
import type { DynamicHostedWalletToVerbsWalletOptions } from '@/types/wallet.js'
import { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import { DynamicWallet } from '@/wallet/react/wallets/hosted/dynamic/DynamicWallet.js'

/**
 * Dynamic wallet provider implementation
 * @description Wallet provider implementation using Dynamic service
 */
export class DynamicHostedWalletProvider extends HostedWalletProvider<'dynamic'> {
  /**
   * Create a new Dynamic wallet provider
   */
  constructor(chainManager: ChainManager) {
    super(chainManager)
  }

  async toVerbsWallet(
    params: DynamicHostedWalletToVerbsWalletOptions,
  ): Promise<Wallet> {
    return DynamicWallet.create({
      dynamicWallet: params.wallet,
      chainManager: this.chainManager,
    })
  }
}
