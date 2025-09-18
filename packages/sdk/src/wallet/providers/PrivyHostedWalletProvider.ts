import type { PrivyClient } from '@privy-io/server-auth'
import { getAddress } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { PrivyHostedWalletToVerbsWalletOptions } from '@/types/wallet.js'
import type { Wallet } from '@/wallet/base/Wallet.js'
import { PrivyWallet } from '@/wallet/PrivyWallet.js'
import { HostedWalletProvider } from '@/wallet/providers/base/HostedWalletProvider.js'

/**
 * Privy wallet provider implementation
 * @description Wallet provider implementation using Privy service
 */
export class PrivyHostedWalletProvider extends HostedWalletProvider<'privy'> {
  /**
   * Create a new Privy wallet provider
   * @param privyClient - Privy client instance
   */
  constructor(
    private readonly privyClient: PrivyClient,
    chainManager: ChainManager,
  ) {
    super(chainManager)
  }

  async toVerbsWallet(
    params: PrivyHostedWalletToVerbsWalletOptions,
  ): Promise<Wallet> {
    return PrivyWallet.create({
      privyClient: this.privyClient,
      walletId: params.walletId,
      address: getAddress(params.address),
      chainManager: this.chainManager,
    })
  }
}
