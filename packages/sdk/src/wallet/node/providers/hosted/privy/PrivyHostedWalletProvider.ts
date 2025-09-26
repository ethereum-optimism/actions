import type { PrivyClient } from '@privy-io/server-auth'
import { getAddress } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type {
  NodeToVerbsOptionsMap,
  PrivyHostedWalletToVerbsWalletOptions,
} from '@/wallet/node/providers/hosted/types/index.js'
import { PrivyWallet } from '@/wallet/node/wallets/hosted/privy/PrivyWallet.js'

/**
 * Privy wallet provider implementation
 * @description Wallet provider implementation using Privy service
 */
export class PrivyHostedWalletProvider extends HostedWalletProvider<
  'privy',
  NodeToVerbsOptionsMap
> {
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
