import type { Address, Hash } from 'viem'

import type {
  LendOptions,
  LendTransaction,
  TransactionData,
} from '@/types/lend.js'
import type { TokenBalance } from '@/types/token.js'
import type { AssetIdentifier } from '@/utils/assets.js'

/**
 * Wallet provider interface
 * @description Interface for wallet provider implementations
 */
export interface WalletProvider {
  /**
   * Initialize the wallet provider
   */
  init?(): Promise<void>

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
  /**
   * Sign and send a transaction
   * @param walletId - Wallet ID to use for signing
   * @param transactionData - Transaction data to sign and send
   * @returns Promise resolving to transaction hash
   */
  sign(walletId: string, transactionData: TransactionData): Promise<Hash>
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
   * Get asset balances aggregated across all supported chains
   * @returns Promise resolving to array of asset balances
   */
  getBalance(): Promise<TokenBalance[]>
  /**
   * Lend assets to a lending market
   * @param amount - Human-readable amount to lend (e.g. 1.5)
   * @param asset - Asset symbol (e.g. 'usdc') or token address
   * @param marketId - Optional specific market ID or vault name
   * @param options - Optional lending configuration
   * @returns Promise resolving to lending transaction details
   */
  lend(
    amount: number,
    asset: AssetIdentifier,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction>
  /**
   * Sign and send a transaction
   * @param transactionData - Transaction data to sign and send
   * @returns Promise resolving to transaction hash
   */
  signAndSend(transactionData: TransactionData): Promise<Hash>
  /**
   * Sign a transaction without sending it
   * @param transactionData - Transaction data to sign
   * @returns Promise resolving to signed transaction
   */
  sign(transactionData: TransactionData): Promise<`0x${string}`>
  /**
   * Send a signed transaction
   * @param signedTransaction - Signed transaction to send
   * @param publicClient - Viem public client to send the transaction
   * @returns Promise resolving to transaction hash
   */
  send(signedTransaction: string, publicClient: any): Promise<Hash>
  /**
   * Send tokens to another address
   * @param amount - Human-readable amount to send (e.g. 1.5)
   * @param asset - Asset symbol (e.g. 'usdc', 'eth') or token address
   * @param recipientAddress - Address to send to
   * @returns Promise resolving to transaction data
   */
  sendTokens(
    amount: number,
    asset: AssetIdentifier,
    recipientAddress: Address,
  ): Promise<TransactionData>
}
