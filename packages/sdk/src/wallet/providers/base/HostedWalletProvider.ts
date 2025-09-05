import type { HostedWallet } from '@/wallet/base/HostedWallet.js'

/**
 * Base hosted wallet provider class
 * @description Abstract base class for hosted wallet provider implementations (Privy, Dynamic, etc.).
 * Provides a standard interface for creating and retrieving hosted wallets that can be used
 * as signers for smart wallets or standalone wallet functionality.
 */
export abstract class HostedWalletProvider {
  /**
   * Create a new hosted wallet
   * @description Creates a new hosted wallet instance using the provider's infrastructure.
   * The wallet will be ready to use for signing transactions and messages.
   * @returns Promise resolving to a new hosted wallet instance
   */
  abstract createWallet(): Promise<HostedWallet>

  /**
   * Get an existing hosted wallet by ID
   * @description Retrieves an existing hosted wallet using its unique identifier.
   * The wallet must have been previously created through this provider.
   * @param params - Wallet retrieval parameters
   * @param params.walletId - Unique identifier for the hosted wallet
   * @returns Promise resolving to the existing hosted wallet instance
   * @throws Error if wallet with the specified ID is not found
   */
  abstract getWallet(params: { walletId: string }): Promise<HostedWallet>
}
