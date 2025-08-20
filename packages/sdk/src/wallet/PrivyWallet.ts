import type { Address, Hash } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { TransactionData } from '@/types/lend.js'

import type { PrivyWalletProvider } from './providers/privy.js'

/**
 * Privy wallet implementation
 * @description Wallet implementation using Privy service
 */
export class PrivyWallet {
  private privyProvider: PrivyWalletProvider
  private chainManager: ChainManager
  private walletId: string
  private address: Address
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
   * Sign and send a transaction using Privy
   * @description Signs and sends a transaction using Privy's wallet API
   * @param walletId - Wallet ID to use for signing
   * @param transactionData - Transaction data to sign and send
   * @returns Promise resolving to transaction hash
   * @throws Error if transaction signing fails
   */
  async sign(transactionData: TransactionData): Promise<Hash> {
    try {
      const response =
        await this.privyProvider.privy.walletApi.ethereum.sendTransaction({
          walletId: this.walletId,
          caip2: 'eip155:130', // Unichain
          transaction: {
            to: transactionData.to,
            data: transactionData.data as `0x${string}`,
            value: Number(transactionData.value),
            chainId: 130, // Unichain
          },
        })

      return response.hash as Hash
    } catch (error) {
      throw new Error(
        `Failed to sign transaction for wallet ${this.walletId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }

  /**
   * Sign a transaction without sending it
   * @description Signs a transaction using Privy's wallet API but doesn't send it
   * @param walletId - Wallet ID to use for signing
   * @param transactionData - Transaction data to sign
   * @returns Promise resolving to signed transaction
   * @throws Error if transaction signing fails
   */
  async signOnly(transactionData: TransactionData): Promise<string> {
    try {
      // Get public client for gas estimation
      const publicClient = this.chainManager.getPublicClient(130) // Unichain

      // Estimate gas limit
      const gasLimit = await publicClient.estimateGas({
        account: this.address,
        to: transactionData.to,
        data: transactionData.data as `0x${string}`,
        value: BigInt(transactionData.value),
      })

      // Get current gas price and fee data
      const feeData = await publicClient.estimateFeesPerGas()

      // Get current nonce for the wallet - manual management since Privy isn't handling it properly
      const nonce = await publicClient.getTransactionCount({
        address: this.address,
        blockTag: 'pending', // Use pending to get the next nonce including any pending txs
      })

      // According to Privy docs: if you provide ANY gas parameters, you must provide ALL of them
      const txParams: any = {
        to: transactionData.to,
        data: transactionData.data as `0x${string}`,
        value: transactionData.value as `0x${string}`,
        chainId: 130, // Unichain
        type: 2, // EIP-1559
        gasLimit: `0x${gasLimit.toString(16)}`,
        maxFeePerGas: `0x${(feeData.maxFeePerGas || BigInt(1000000000)).toString(16)}`, // fallback to 1 gwei
        maxPriorityFeePerGas: `0x${(feeData.maxPriorityFeePerGas || BigInt(100000000)).toString(16)}`, // fallback to 0.1 gwei
        nonce: `0x${nonce.toString(16)}`, // Explicitly provide the correct nonce
      }

      console.log(
        `[PRIVY_PROVIDER] Complete tx params - Type: ${txParams.type}, Nonce: ${nonce}, Limit: ${gasLimit}, MaxFee: ${feeData.maxFeePerGas || 'fallback'}, Priority: ${feeData.maxPriorityFeePerGas || 'fallback'}`,
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
