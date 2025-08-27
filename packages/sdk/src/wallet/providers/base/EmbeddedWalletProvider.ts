import type { EmbeddedWallet } from '@/wallet/base/EmbeddedWallet.js'

/**
 * Base embedded wallet provider class
 * @description Abstract base class for embedded wallet provider implementations (Privy, Dynamic, etc.).
 * Provides a standard interface for creating and retrieving embedded wallets that can be used
 * as signers for smart wallets or standalone wallet functionality.
 */
export abstract class EmbeddedWalletProvider {
  /**
   * Create a new embedded wallet
   * @description Creates a new embedded wallet instance using the provider's infrastructure.
   * The wallet will be ready to use for signing transactions and messages.
   * @returns Promise resolving to a new embedded wallet instance
   */
  abstract createWallet(): Promise<EmbeddedWallet>

  /**
   * Get an existing embedded wallet by ID
   * @description Retrieves an existing embedded wallet using its unique identifier.
   * The wallet must have been previously created through this provider.
   * @param params - Wallet retrieval parameters
   * @param params.walletId - Unique identifier for the embedded wallet
   * @returns Promise resolving to the existing embedded wallet instance
   * @throws Error if wallet with the specified ID is not found
   */
  abstract getWallet(params: { walletId: string }): Promise<EmbeddedWallet>
}
