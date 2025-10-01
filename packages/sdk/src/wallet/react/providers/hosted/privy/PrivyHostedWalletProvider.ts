import type { LocalAccount } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type { ReactToVerbsOptionsMap } from '@/wallet/react/providers/hosted/types/index.js'
import { PrivyWallet } from '@/wallet/react/wallets/hosted/privy/PrivyWallet.js'
import { createSigner } from '@/wallet/react/wallets/hosted/privy/utils/createSigner.js'

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

  /**
   * Create a viem LocalAccount signer from Privy credentials
   * @description Produces a signing account backed by Privy without wrapping
   * it in a full Verbs wallet. This is useful when you need to pass the signer
   * into a Verbs smart wallet as a signer, for lower-level viem operations, or
   * for passing to other libraries that accept a viem `LocalAccount`.
   * @param params - Privy configuration for the signer
   * @param params.connectedWallet - Privy connected wallet
   * @returns Promise resolving to a viem `LocalAccount` with Privy as the signer backend
   */
  async createSigner(
    params: ReactToVerbsOptionsMap['privy'],
  ): Promise<LocalAccount> {
    return createSigner(params)
  }
}
