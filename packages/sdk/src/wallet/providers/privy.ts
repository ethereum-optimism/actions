import { PrivyClient } from '@privy-io/server-auth'
import { getAddress } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import { PrivyWallet } from '@/wallet/PrivyWallet.js'
import { EmbeddedWalletProvider } from '@/wallet/providers/base/EmbeddedWalletProvider.js'

/**
 * Options for getting all wallets
 * @description Parameters for filtering and paginating wallet results
 */
export interface PrivyProviderGetAllWalletsOptions {
  /** Maximum number of wallets to return */
  limit?: number
  /** Cursor for pagination */
  cursor?: string
}

/**
 * Privy wallet provider implementation
 * @description Wallet provider implementation using Privy service
 */
export class PrivyEmbeddedWalletProvider extends EmbeddedWalletProvider {
  public privy: PrivyClient
  private chainManager: ChainManager

  /**
   * Create a new Privy wallet provider
   * @param appId - Privy application ID
   * @param appSecret - Privy application secret
   * @param verbs - Verbs instance for accessing configured providers
   */
  constructor(appId: string, appSecret: string, chainManager: ChainManager) {
    super()
    this.privy = new PrivyClient(appId, appSecret)
    this.chainManager = chainManager
  }

  /**
   * Create new wallet via Privy
   * @description Creates a new wallet using Privy's wallet API
   * @returns Promise resolving to new wallet instance
   * @throws Error if wallet creation fails
   */
  async createWallet(): Promise<PrivyWallet> {
    try {
      const wallet = await this.privy.walletApi.createWallet({
        chainType: 'ethereum',
      })

      const walletInstance = new PrivyWallet(
        this,
        this.chainManager,
        wallet.id,
        getAddress(wallet.address),
      )
      return walletInstance
    } catch {
      throw new Error(`Failed to create wallet`)
    }
  }

  /**
   * Get wallet by wallet ID via Privy
   * @description Retrieves wallet information from Privy service
   * @param params - Parameters containing walletId
   * @returns Promise resolving to wallet
   */
  async getWallet(params: { walletId: string }): Promise<PrivyWallet> {
    try {
      const wallet = await this.privy.walletApi.getWallet({
        id: params.walletId,
      })

      const walletInstance = new PrivyWallet(
        this,
        this.chainManager,
        wallet.id,
        getAddress(wallet.address),
      )
      return walletInstance
    } catch {
      throw new Error(`Failed to get wallet with id: ${params.walletId}`)
    }
  }

  /**
   * Get all wallets via Privy
   * @description Retrieves all wallets from Privy service with optional filtering
   * @param options - Optional parameters for filtering and pagination
   * @returns Promise resolving to array of wallets
   */
  async getAllWallets(
    options?: PrivyProviderGetAllWalletsOptions,
  ): Promise<PrivyWallet[]> {
    try {
      const response = await this.privy.walletApi.getWallets({
        limit: options?.limit,
        cursor: options?.cursor,
      })

      return response.data.map((wallet) => {
        const walletInstance = new PrivyWallet(
          this,
          this.chainManager,
          wallet.id,
          getAddress(wallet.address),
        )
        return walletInstance
      })
    } catch {
      throw new Error('Failed to retrieve wallets')
    }
  }
}
