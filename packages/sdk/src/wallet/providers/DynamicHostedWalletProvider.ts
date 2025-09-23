import type { ChainManager } from '@/services/ChainManager.js'
import type { DynamicHostedWalletToVerbsWalletOptions } from '@/types/wallet.js'
import type { Wallet } from '@/wallet/base/Wallet.js'
import { DynamicWallet } from '@/wallet/DynamicWallet.js'
import { HostedWalletProvider } from '@/wallet/providers/base/HostedWalletProvider.js'

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
