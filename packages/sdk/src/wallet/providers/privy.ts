import { PrivyClient } from '@privy-io/server-auth'
import { getAddress, type Hash } from 'viem'

import { Wallet } from '@/index.js'
import type { TransactionData } from '@/types/lend.js'
import type { VerbsInterface } from '@/types/verbs.js'
import type { GetAllWalletsOptions, WalletProvider } from '@/types/wallet.js'

/**
 * Privy wallet provider implementation
 * @description Wallet provider implementation using Privy service
 */
export class WalletProviderPrivy implements WalletProvider {
  private privy: PrivyClient
  private verbs: VerbsInterface

  /**
   * Create a new Privy wallet provider
   * @param appId - Privy application ID
   * @param appSecret - Privy application secret
   * @param verbs - Verbs instance for accessing configured providers
   */
  constructor(appId: string, appSecret: string, verbs: VerbsInterface) {
    this.privy = new PrivyClient(appId, appSecret)
    this.verbs = verbs
  }

  /**
   * Create new wallet via Privy
   * @description Creates a new wallet using Privy's wallet API
   * @param userId - User identifier for the wallet
   * @returns Promise resolving to new wallet instance
   * @throws Error if wallet creation fails
   */
  async createWallet(userId: string): Promise<Wallet> {
    try {
      const wallet = await this.privy.walletApi.createWallet({
        chainType: 'ethereum',
      })

      const walletInstance = new Wallet(wallet.id, this.verbs, this)
      walletInstance.init(getAddress(wallet.address))
      return walletInstance
    } catch {
      throw new Error(`Failed to create wallet for user ${userId}`)
    }
  }

  /**
   * Get wallet by user ID via Privy
   * @description Retrieves wallet information from Privy service
   * @param userId - User identifier
   * @returns Promise resolving to wallet or null if not found
   */
  async getWallet(userId: string): Promise<Wallet | null> {
    try {
      // TODO: Implement proper user-to-wallet lookup
      const wallet = await this.privy.walletApi.getWallet({ id: userId })

      const walletInstance = new Wallet(wallet.id, this.verbs, this)
      walletInstance.init(getAddress(wallet.address))
      return walletInstance
    } catch {
      return null
    }
  }

  /**
   * Get all wallets via Privy
   * @description Retrieves all wallets from Privy service with optional filtering
   * @param options - Optional parameters for filtering and pagination
   * @returns Promise resolving to array of wallets
   */
  async getAllWallets(options?: GetAllWalletsOptions): Promise<Wallet[]> {
    try {
      const response = await this.privy.walletApi.getWallets({
        limit: options?.limit,
        cursor: options?.cursor,
      })

      return response.data.map((wallet) => {
        const walletInstance = new Wallet(wallet.id, this.verbs, this)
        walletInstance.init(getAddress(wallet.address))
        return walletInstance
      })
    } catch {
      throw new Error('Failed to retrieve wallets')
    }
  }

  /**
   * Sign and send a transaction using Privy
   * @description Signs and sends a transaction using Privy's wallet API
   * @param walletId - Wallet ID to use for signing
   * @param transactionData - Transaction data to sign and send
   * @returns Promise resolving to transaction hash
   * @throws Error if transaction signing fails
   */
  async sign(
    walletId: string,
    transactionData: TransactionData,
  ): Promise<Hash> {
    try {
      const response = await this.privy.walletApi.ethereum.sendTransaction({
        walletId,
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
        `Failed to sign transaction for wallet ${walletId}: ${
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
  async signOnly(
    walletId: string,
    transactionData: TransactionData,
    nonce?: number,
  ): Promise<string> {
    try {
      const txParams: any = {
        to: transactionData.to,
        data: transactionData.data as `0x${string}`,
        value: transactionData.value as `0x${string}`,
        chainId: 130, // Unichain
        // Add gas parameters for supersim compatibility (EIP-1559)
        gasLimit: '0x186A0', // 100000 gas limit (increased for safety)
        maxFeePerGas: '0x5D21DBA00', // 25 gwei max fee
        maxPriorityFeePerGas: '0x77359400', // 2 gwei priority fee
      }

      // Add nonce if provided
      if (nonce !== undefined) {
        txParams.nonce = `0x${nonce.toString(16)}`
      }

      const response = await this.privy.walletApi.ethereum.signTransaction({
        walletId,
        transaction: txParams,
      })

      return response.signedTransaction
    } catch (error) {
      throw new Error(
        `Failed to sign transaction for wallet ${walletId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }
}
