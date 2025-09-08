import type { HostedWalletToVerbsWalletOptions } from '@/types/wallet.js'
import type { VerbsWallet } from '@/wallet/base/VerbsWallet.js'

/**
 * Base hosted wallet provider class
 * @description Abstract base class for hosted wallet provider implementations (Privy, Dynamic, etc.).
 * Provides a standard interface for creating and retrieving hosted wallets that can be used
 * as signers for smart wallets or standalone wallet functionality.
 */
export abstract class HostedWalletProvider {
  /**
   * Convert a hosted wallet to a Verbs wallet
   * @description Converts a hosted wallet to a Verbs wallet instance.
   * @param params - Parameters for converting a hosted wallet to a Verbs wallet
   * @param params.walletId - Unique identifier for the hosted wallet
   * @param params.address - Ethereum address of the hosted wallet
   * @returns Promise resolving to the Verbs wallet instance
   */
  abstract toVerbsWallet(
    params: HostedWalletToVerbsWalletOptions,
  ): Promise<VerbsWallet>
}
