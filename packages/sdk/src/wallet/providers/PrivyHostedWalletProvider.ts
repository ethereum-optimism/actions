import type { PrivyClient } from '@privy-io/server-auth'
import { getAddress } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { HostedWalletToVerbsWalletOptions } from '@/types/wallet.js'
import type { HostedWallet } from '@/wallet/base/HostedWallet.js'
import { PrivyWallet } from '@/wallet/PrivyWallet.js'
import { HostedWalletProvider } from '@/wallet/providers/base/HostedWalletProvider.js'

/**
 * Privy wallet provider implementation
 * @description Wallet provider implementation using Privy service
 */
export class PrivyHostedWalletProvider extends HostedWalletProvider {
  /**
   * Create a new Privy wallet provider
   * @param privyClient - Privy client instance
   */
  constructor(
    private readonly privyClient: PrivyClient,
    private readonly chainManager: ChainManager,
  ) {
    super()
  }

  async toVerbsWallet(
    params: HostedWalletToVerbsWalletOptions,
  ): Promise<HostedWallet> {
    return new PrivyWallet(
      this.privyClient,
      params.walletId,
      getAddress(params.address),
      this.chainManager,
    )
  }
}
