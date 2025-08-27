import type { Address } from 'viem'
import type { WebAuthnAccount } from 'viem/account-abstraction'

import type { WalletProvider } from '@/wallet/WalletProvider.js'

/**
 * Wallet namespace that provides unified wallet operations
 * @description Provides access to wallet functionality through a single provider interface
 */
export class WalletNamespace {
  private provider: WalletProvider

  constructor(provider: WalletProvider) {
    this.provider = provider
  }

  get embeddedWalletProvider() {
    return this.provider.embeddedWalletProvider
  }

  get smartWalletProvider() {
    return this.provider.smartWalletProvider
  }

  // Convenience methods that delegate to the provider
  async createWallet() {
    return this.provider.createWallet()
  }

  async getWallet(params: {
    walletId: string
    owners?: Array<Address | WebAuthnAccount>
    signerOwnerIndex?: number
    walletAddress?: Address
    nonce?: bigint
  }) {
    return this.provider.getWallet(params)
  }
}
