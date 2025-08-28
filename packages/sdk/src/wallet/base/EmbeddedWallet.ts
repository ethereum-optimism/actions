import type { Address, LocalAccount } from 'viem'

/**
 * Base embedded wallet class
 * @description Abstract base class for embedded wallet implementations (Privy, Dynamic, etc.).
 * Provides a standard interface for embedded wallets that can be used as signers for smart wallets.
 */
export abstract class EmbeddedWallet {
  /** The wallet's Ethereum address */
  public readonly address: Address

  /**
   * Create an embedded wallet instance
   * @param address - The wallet's Ethereum address
   */
  constructor(address: Address) {
    this.address = address
  }

  /**
   * Get a signer for this embedded wallet
   * @description Returns a LocalAccount that can be used to sign transactions and messages.
   * This is typically used as the signer for smart wallet operations.
   * @returns Promise resolving to a LocalAccount configured for signing operations
   */
  abstract signer(): Promise<LocalAccount>
}
