import type { LocalAccount } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

/**
 * Base hosted wallet provider class
 * @description Abstract base class for hosted wallet provider implementations (Privy, Dynamic, etc.).
 * Provides a standard interface for creating and retrieving hosted wallets that can be used
 * as signers for smart wallets or standalone wallet functionality.
 */
export abstract class HostedWalletProvider<
  TType extends string,
  TOptionsMap extends Record<TType, unknown>,
> {
  protected chainManager: ChainManager

  protected constructor(chainManager: ChainManager) {
    this.chainManager = chainManager
  }
  /**
   * Convert a hosted wallet to an Actions wallet
   * @description Converts a hosted wallet to an Actions wallet instance.
   * @param params - Parameters for converting a hosted wallet to an Actions wallet
   * @returns Promise resolving to the Actions wallet instance
   */
  abstract toActionsWallet(params: TOptionsMap[TType]): Promise<Wallet>

  /**
   * Create a viem LocalAccount signer from the hosted wallet
   * @description Produces a signing account backed by the hosted wallet without wrapping
   * it in a full Actions wallet. This is useful when you need to pass the signer
   * into an Actions smart wallet as a signer, for lower-level viem operations, or
   * for passing to other libraries that accept a viem `LocalAccount`.
   * @param params - Configuration for the signer
   * @returns Promise resolving to a viem `LocalAccount` with the hosted wallet as the signer backend
   */
  abstract createSigner(params: TOptionsMap[TType]): Promise<LocalAccount>
}
