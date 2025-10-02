import type { LocalAccount } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type { ReactToVerbsOptionsMap } from '@/wallet/react/providers/hosted/types/index.js'
import { DynamicWallet } from '@/wallet/react/wallets/hosted/dynamic/DynamicWallet.js'
import { createSigner } from '@/wallet/react/wallets/hosted/dynamic/utils/createSigner.js'

/**
 * Dynamic wallet provider implementation
 * @description Wallet provider implementation using Dynamic service
 */
export class DynamicHostedWalletProvider extends HostedWalletProvider<
  'dynamic',
  ReactToVerbsOptionsMap
> {
  /**
   * Create a new Dynamic wallet provider
   */
  constructor(chainManager: ChainManager) {
    super(chainManager)
  }

  async toVerbsWallet(
    params: ReactToVerbsOptionsMap['dynamic'],
  ): Promise<Wallet> {
    return DynamicWallet.create({
      dynamicWallet: params.wallet,
      chainManager: this.chainManager,
    })
  }

  /**
   * Create a viem LocalAccount signer from Dynamic credentials
   * @description Produces a signing account backed by Dynamic without wrapping
   * it in a full Verbs wallet. This is useful when you need to pass the signer
   * into a Verbs smart wallet as a signer, for lower-level viem operations, or
   * for passing to other libraries that accept a viem `LocalAccount`.
   * @param params - Dynamic configuration for the signer
   * @param params.wallet - Dynamic wallet instance
   * @returns Promise resolving to a viem `LocalAccount` with Dynamic as the signer backend
   */
  async createSigner(
    params: ReactToVerbsOptionsMap['dynamic'],
  ): Promise<LocalAccount> {
    return createSigner(params)
  }
}
