import type { Address, Hash, Hex, LocalAccount, Quantity } from 'viem'
import { toAccount } from 'viem/accounts'

import type { ChainManager } from '@/services/ChainManager.js'

import type { PrivyWalletProvider } from './providers/privy.js'

/**
 * Privy wallet implementation
 * @description Wallet implementation using Privy service
 */
export class PrivyWallet {
  public address: Address
  public walletId: string
  private privyProvider: PrivyWalletProvider
  private chainManager: ChainManager
  /**
   * Create a new Privy wallet provider
   * @param appId - Privy application ID
   * @param appSecret - Privy application secret
   * @param verbs - Verbs instance for accessing configured providers
   */
  constructor(
    privyProvider: PrivyWalletProvider,
    chainManager: ChainManager,
    walletId: string,
    address: Address,
  ) {
    this.privyProvider = privyProvider
    this.chainManager = chainManager
    this.walletId = walletId
    this.address = address
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

  /**
   * Sign a transaction without sending it
   * @description Signs a transaction using Privy's wallet API but doesn't send it
   * @param walletId - Wallet ID to use for signing
   * @param transactionData - Transaction data to sign
   * @returns Promise resolving to signed transaction
   * @throws Error if transaction signing fails
   */
  async signOnly(txParams: {
    /** The address the transaction is sent from. Must be hexadecimal formatted. */
    from?: Hex
    /** Destination address of the transaction. */
    to?: Hex
    /** The nonce to be used for the transaction (hexadecimal or number). */
    nonce?: Quantity
    /** (optional) The chain ID of network your transaction will  be sent on. */
    chainId?: Quantity
    /** (optional) Data to send to the receiving address, especially when calling smart contracts. Must be hexadecimal formatted. */
    data?: Hex
    /** (optional) The value (in wei) be sent with the transaction (hexadecimal or number). */
    value?: Quantity
    /** (optional) The EIP-2718 transction type (e.g. `2` for EIP-1559 transactions). */
    type?: 0 | 1 | 2
    /** (optional) The max units of gas that can be used by this transaction (hexadecimal or number). */
    gasLimit?: Quantity
    /** (optional) The price (in wei) per unit of gas for this transaction (hexadecimal or number), for use in non EIP-1559 transactions (type 0 or 1). */
    gasPrice?: Quantity
    /** (optional) The maxFeePerGas (hexadecimal or number) to be used in this transaction, for use in EIP-1559 (type 2) transactions. */
    maxFeePerGas?: Quantity
    /** (optional) The maxPriorityFeePerGas (hexadecimal or number) to be used in this transaction, for use in EIP-1559 (type 2) transactions. */
    maxPriorityFeePerGas?: Quantity
  }): Promise<string> {
    try {
      console.log(
        `[PRIVY_PROVIDER] Complete tx params - Type: ${txParams.type}, Nonce: ${txParams.nonce}, Limit: ${txParams.gasLimit}, MaxFee: ${txParams.maxFeePerGas || 'fallback'}, Priority: ${txParams.maxPriorityFeePerGas || 'fallback'}`,
      )

      const response =
        await this.privyProvider.privy.walletApi.ethereum.signTransaction({
          walletId: this.walletId,
          transaction: txParams,
        })

      return response.signedTransaction
    } catch (error) {
      throw new Error(
        `Failed to sign transaction for wallet ${this.walletId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }
}
