import type { ChainManager } from '@/services/ChainManager.js'
import { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type { ReactToVerbsOptionsMap } from '@/wallet/react/providers/hosted/types/index.js'
import { PrivyWallet } from '@/wallet/react/wallets/hosted/privy/PrivyWallet.js'

/**
 * Privy hosted wallet provider (React)
 */
export class PrivyHostedWalletProvider extends HostedWalletProvider<
  'privy',
  ReactToVerbsOptionsMap
> {
  /**
   * Create a new Privy wallet provider
   * @param chainManager Chain manager for RPC, chain info, and transports
   */
  constructor(chainManager: ChainManager) {
    super(chainManager)
  }

  async toVerbsWallet(
    params: ReactToVerbsOptionsMap['privy'],
  ): Promise<Wallet> {
    const { connectedWallet } = params
    const wallet = await PrivyWallet.create({
      chainManager: this.chainManager,
      connectedWallet,
    })
    return wallet
  }
}
