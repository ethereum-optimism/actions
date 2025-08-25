import type { Address } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { ChainConfig } from '@/types/chain.js'

import type { LendConfig, LendProvider } from './lend.js'
import type { Wallet } from './wallet.js'

/**
 * Core Verbs SDK interface
 * @description Main interface for interacting with the Verbs SDK
 */
export interface VerbsInterface {
  /**
   * Get the lend provider instance
   * @returns LendProvider instance if configured
   */
  readonly lend: LendProvider
  /**
   * Get the chain manager instance
   * @returns ChainManager instance for multi-chain operations
   */
  readonly chainManager: ChainManager
  /**
   * Create a new wallet
   * @param ownerAddresses - User identifier for the wallet
   * @returns Promise resolving to new wallet instance
   */
  createWallet(
    ownerAddresses: Address[],
    nonce?: bigint,
  ): Promise<Array<{ chainId: number; address: Address }>>
  /**
   * Get all wallets
   * @param options - Optional parameters for filtering and pagination
   * @returns Promise resolving to array of wallets
   */
  // getAllWallets(options?: GetAllWalletsOptions): Promise<Wallet[]>
  /**
   * Get the smart wallet address for an owner address
   * @param ownerAddress - Owner address
   * @param chainId - Chain ID
   * @returns Promise resolving to smart wallet address
   */
  getWallet(ownerAddresses: Address[], nonce?: bigint): Promise<Wallet>
}

/**
 * Verbs SDK configuration
 * @description Configuration object for initializing the Verbs SDK
 */
export interface VerbsConfig {
  /** Wallet provider configuration */
  wallet: WalletConfig
  /** Lending provider configuration (optional) */
  lend?: LendConfig
  /** Chains to use for the SDK */
  chains?: ChainConfig[]
  /** Bundler URL for the wallet */
  bundlerUrl?: string
}

/**
 * Wallet provider configuration
 * @description Configuration for wallet providers
 */
export type WalletConfig = PrivyWalletConfig

/**
 * Privy wallet provider configuration
 * @description Configuration specific to Privy wallet provider
 */
export interface PrivyWalletConfig {
  /** Wallet provider type */
  type: 'privy'
  /** Privy app ID */
  appId: string
  /** Privy app secret */
  appSecret: string
}
