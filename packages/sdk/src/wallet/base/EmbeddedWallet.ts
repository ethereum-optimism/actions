import type { Address, LocalAccount, WalletClient } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'

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
   * Get an account for this embedded wallet
   * @description Returns a LocalAccount that can be used to sign transactions and messages.
   * This can be used as the account for smart wallet operations if the embedded wallet is an
   * owner on the smart wallet.
   * @returns Promise resolving to a LocalAccount configured for signing operations
   */
  abstract account(): Promise<LocalAccount>

  /**
   * Get a wallet client for this embedded wallet
   * @description Returns a WalletClient that can be used to send transactions and interact
   * with smart contracts.
   * @param chainId - The chain ID to create the wallet client for
   * @returns Promise resolving to a WalletClient configured for the specified chain
   */
  abstract walletClient(chainId: SupportedChainId): Promise<WalletClient>
}
