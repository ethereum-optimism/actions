import type { DynamicEvmWalletClient } from '@dynamic-labs-wallet/node-evm'

import type { ChainManager } from '@/services/ChainManager.js'
import type { DynamicHostedWalletToVerbsWalletOptions } from '@/types/wallet.js'
import type { Wallet } from '@/wallet/base/Wallet.js'
import { DynamicWallet } from '@/wallet/DynamicWallet.js'
import { HostedWalletProvider } from '@/wallet/providers/base/HostedWalletProvider.js'

/**
 * Privy wallet provider implementation
 * @description Wallet provider implementation using Privy service
 */
export class DynamicHostedWalletProvider extends HostedWalletProvider<DynamicHostedWalletToVerbsWalletOptions> {
  /**
   * Create a new Privy wallet provider
   * @param privyClient - Privy client instance
   */
  constructor(
    private readonly dynamicClient: DynamicEvmWalletClient,
    chainManager: ChainManager,
  ) {
    super(chainManager)
  }

  async toVerbsWallet(
    params: DynamicHostedWalletToVerbsWalletOptions,
  ): Promise<Wallet> {
    return new DynamicWallet(
      this.dynamicClient,
      params.address,
      this.chainManager,
      params.password,
      params.keyShares,
    )
  }
}
