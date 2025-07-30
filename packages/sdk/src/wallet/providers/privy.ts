import { PrivyClient } from '@privy-io/server-auth'
import { getAddress } from 'viem'

import { Wallet } from '@/index.js'
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
  constructor(
    appId: string,
    appSecret: string,
    verbs: VerbsInterface,
  ) {
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

      const walletInstance = new Wallet(wallet.id, this.verbs)
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

      const walletInstance = new Wallet(wallet.id, this.verbs)
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
        const walletInstance = new Wallet(wallet.id, this.verbs)
        walletInstance.init(getAddress(wallet.address))
        return walletInstance
      })
    } catch {
      throw new Error('Failed to retrieve wallets')
    }
  }
}
