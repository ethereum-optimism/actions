import type { ChainManager } from '@/services/ChainManager.js'
import type {
  HostedProviderType,
  HostedWalletToVerbsOptionsFor,
} from '@/wallet/core/providers/hosted/types/index.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

/**
 * Base hosted wallet provider class
 * @description Abstract base class for hosted wallet provider implementations (Privy, Dynamic, etc.).
 * Provides a standard interface for creating and retrieving hosted wallets that can be used
 * as signers for smart wallets or standalone wallet functionality.
 */
export abstract class HostedWalletProvider<
  T extends HostedProviderType = HostedProviderType,
> {
  protected chainManager: ChainManager

  protected constructor(chainManager: ChainManager) {
    this.chainManager = chainManager
  }
  /**
   * Convert a hosted wallet to a Verbs wallet
   * @description Converts a hosted wallet to a Verbs wallet instance.
   * @param params - Parameters for converting a hosted wallet to a Verbs wallet
   * @returns Promise resolving to the Verbs wallet instance
   */
  abstract toVerbsWallet(
    params: HostedWalletToVerbsOptionsFor<T>,
  ): Promise<Wallet>
}
