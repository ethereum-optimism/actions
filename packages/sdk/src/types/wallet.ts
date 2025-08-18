import type { Address, Hash, Hex, Quantity } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
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
}

/**
 * Wallet interface
 * @description Core wallet interface with blockchain properties and verbs
 */
export interface Wallet {
  /** Wallet address */
  address: Address
  /** Wallet owner addresses */
  ownerAddresses: Address[]
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
  execute(transactionData: TransactionData): Hash
  getTxParams(
    transactionData: TransactionData,
    chainId: SupportedChainId,
    ownerIndex?: number,
  ): Promise<{
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
  }>
  estimateGas(
    transactionData: TransactionData,
    chainId: SupportedChainId,
    ownerIndex?: number,
  ): Promise<bigint>
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
