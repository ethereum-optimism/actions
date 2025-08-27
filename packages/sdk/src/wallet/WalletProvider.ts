import type { LocalAccount } from 'viem'

import type { GetWalletOptions } from '@/types/wallet.js'
import type { EmbeddedWalletProvider } from '@/wallet/providers/base/EmbeddedWalletProvider.js'
import type { SmartWalletProvider } from '@/wallet/providers/base/SmartWalletProvider.js'

/**
 * Unified Wallet Provider
 * @description Main wallet provider that combines embedded wallet and smart wallet functionality.
 * Provides a unified interface for all wallet operations while supporting pluggable providers.
 */
export class WalletProvider {
  public readonly embeddedWalletProvider: EmbeddedWalletProvider
  public readonly smartWalletProvider: SmartWalletProvider

  constructor(
    embeddedWalletProvider: EmbeddedWalletProvider,
    smartWalletProvider: SmartWalletProvider,
  ) {
    this.embeddedWalletProvider = embeddedWalletProvider
    this.smartWalletProvider = smartWalletProvider
  }

  async createWallet() {
    const embeddedWallet = await this.embeddedWalletProvider.createWallet()
    const signer = await embeddedWallet.signer()
    return this.smartWalletProvider.createWallet({
      owners: [embeddedWallet.address],
      signer,
    })
  }

  /**
   * Get an existing wallet
   */
  async getWallet(params: GetWalletOptions) {
    const { walletId } = params
    const embeddedWallet = await this.embeddedWalletProvider.getWallet({
      walletId,
    })
    if (!embeddedWallet) {
      throw new Error('Embedded wallet not found')
    }
    const signer = await embeddedWallet.signer()
    return this.getSmartWallet(params, signer)
  }

  private async getSmartWallet(params: GetWalletOptions, signer: LocalAccount) {
    const {
      owners,
      signerOwnerIndex,
      walletAddress: walletAddressParam,
      nonce,
    } = params
    const walletAddress =
      walletAddressParam ||
      (await this.smartWalletProvider.getWalletAddress({
        owners: owners || [signer.address],
        nonce,
      }))
    return this.smartWalletProvider.getWallet({
      walletAddress,
      signer,
      ownerIndex: signerOwnerIndex,
    })
  }
}
