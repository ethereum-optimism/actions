import type { Address } from 'viem'

import type { LendOptions, LendProvider, LendTransaction } from './lend.js'

/**
 * Wallet provider interface
 * @description Interface for wallet provider implementations
 */
export interface WalletProvider {
  /**
   * Create a new wallet
   * @param userId - User identifier for the wallet
   * @returns Promise resolving to new wallet instance
   */
  createWallet(userId: string): Promise<Wallet>
  /**
   * Get wallet by user ID
   * @param userId - User identifier
   * @returns Promise resolving to wallet or null if not found
   */
  getWallet(userId: string): Promise<Wallet | null>
  /**
   * Get all wallets
   * @param options - Optional parameters for filtering and pagination
   * @returns Promise resolving to array of wallets
   */
  getAllWallets(options?: GetAllWalletsOptions): Promise<Wallet[]>
}

/**
 * Wallet interface
 * @description Core wallet interface with blockchain properties and verbs
 */
export interface Wallet extends WalletVerbs {
  /** Wallet ID */
  id: string
  /** Wallet address */
  address: Address
  /**
   * Set lending provider
   * @description Updates the lending provider for this wallet
   * @param lendProvider - Lending provider instance
   */
  setLendProvider(lendProvider: LendProvider): void
}

/**
 * Options for getting all wallets
 * @description Parameters for filtering and paginating wallet results
 */
export interface GetAllWalletsOptions {
  /** Maximum number of wallets to return */
  limit?: number
  /** Cursor for pagination */
  cursor?: string
}

/**
 * Wallet verbs/actions
 * @description Available actions that can be performed on a wallet
 */
export type WalletVerbs = {
  /**
   * Get wallet balance
   * @returns Promise resolving to wallet balance in wei
   */
  getBalance(): Promise<bigint>
  /**
   * Lend assets to a lending market
   * @param asset - Asset token address to lend
   * @param amount - Amount to lend (in wei)
   * @param marketId - Optional specific market ID
   * @param options - Optional lending configuration
   * @returns Promise resolving to lending transaction details
   */
  lend(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction>
}
