import type { Address, LocalAccount, WalletClient } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'

/**
 * Base hosted wallet class
 * @description Abstract base class for hosted wallet implementations (Privy, Dynamic, etc.).
 * Provides a standard interface for hosted wallets that can be used as signers for smart wallets.
 */
export abstract class HostedWallet {
  /** The wallet's Ethereum address */
  public readonly address: Address

  /**
   * Create a hosted wallet instance
   * @param address - The wallet's Ethereum address
   */
  constructor(address: Address) {
    this.address = address
  }

  /**
   * Get an account for this hosted wallet
   * @description Returns a LocalAccount that can be used to sign transactions and messages.
   * This can be used as the account for smart wallet operations if the hosted wallet is an
   * owner on the smart wallet.
   * @returns Promise resolving to a LocalAccount configured for signing operations
   */
  abstract account(): Promise<LocalAccount>

  /**
   * Get a wallet client for this hosted wallet
   * @description Returns a WalletClient that can be used to send transactions and interact
   * with smart contracts.
   * @param chainId - The chain ID to create the wallet client for
   * @returns Promise resolving to a WalletClient configured for the specified chain
   */
  abstract walletClient(chainId: SupportedChainId): Promise<WalletClient>
}
