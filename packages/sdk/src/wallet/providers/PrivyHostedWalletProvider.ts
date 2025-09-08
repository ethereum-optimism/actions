import type { PrivyClient } from '@privy-io/server-auth'
import { getAddress } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { HostedWalletToVerbsWalletOptions } from '@/types/wallet.js'
import type { VerbsWallet } from '@/wallet/base/VerbsWallet.js'
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
  ): Promise<VerbsWallet> {
    return PrivyWallet.create({
      privyClient: this.privyClient,
      walletId: params.walletId,
      address: getAddress(params.address),
      chainManager: this.chainManager,
    })
  }
}
