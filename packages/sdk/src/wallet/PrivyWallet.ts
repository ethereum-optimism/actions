import type { Address, Hash, LocalAccount } from 'viem'
import { toAccount } from 'viem/accounts'

import type { ChainManager } from '@/services/ChainManager.js'
import { EmbeddedWallet } from '@/wallet/base/EmbeddedWallet.js'

import type { PrivyEmbeddedWalletProvider } from './providers/privy.js'

/**
 * Privy wallet implementation
 * @description Wallet implementation using Privy service
 */
export class PrivyWallet extends EmbeddedWallet {
  public walletId: string
  private privyProvider: PrivyEmbeddedWalletProvider
  private chainManager: ChainManager
  /**
   * Create a new Privy wallet provider
   * @param appId - Privy application ID
   * @param appSecret - Privy application secret
   * @param verbs - Verbs instance for accessing configured providers
   */
  constructor(
    privyProvider: PrivyEmbeddedWalletProvider,
    chainManager: ChainManager,
    walletId: string,
    address: Address,
  ) {
    super(address)
    this.privyProvider = privyProvider
    this.chainManager = chainManager
    this.walletId = walletId
  }

  /**
   * Create a LocalAccount signer from this Privy wallet
   * @description Converts the Privy wallet into a viem-compatible LocalAccount that can sign
   * messages and transactions. The returned account uses Privy's signing infrastructure
   * under the hood while providing a standard viem interface.
   * @returns Promise resolving to a LocalAccount configured for signing operations
   * @throws Error if wallet retrieval fails or signing operations are not supported
   */
  async signer(): Promise<LocalAccount> {
    const privy = this.privyProvider.privy
    const walletId = this.walletId
    const privyWallet = await privy.walletApi.getWallet({
      id: walletId,
    })
    const signerAddress = privyWallet.address

    return toAccount({
      address: signerAddress as Address,
      async signMessage({ message }) {
        const signed = await privy.walletApi.ethereum.signMessage({
          walletId,
          message: message.toString(),
        })
        return signed.signature as Hash
      },
      async sign(parameters) {
        const signed = await privy.walletApi.ethereum.secp256k1Sign({
          walletId,
          hash: parameters.hash,
        })
        return signed.signature as Hash
      },
      async signTransaction() {
        // Implement if needed
        throw new Error('Not implemented')
      },
      async signTypedData() {
        // Implement if needed
        throw new Error('Not implemented')
      },
    })
  }
}
