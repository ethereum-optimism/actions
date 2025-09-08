import type { Address, LocalAccount, WalletClient } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'

/**
 * Base verbs wallet class
 * @description Abstract base class for verbs wallet implementations.
 * Provides a standard interface for verbs wallets.
 */
export abstract class VerbsWallet {
  /**
   * Get the address of this verbs wallet
   * @description Returns the address of the verbs wallet.
   * @returns The address of the verbs wallet.
   */
  public abstract readonly address: Address
  /**
   * Get an account for this verbs wallet
   * @description Returns a LocalAccount that can be used to sign transactions and messages.
   * This can be used as the account for smart wallet operations if the verbs wallet is an
   * owner on the smart wallet.
   * @returns Promise resolving to a LocalAccount configured for signing operations
   */
  public abstract readonly account: LocalAccount

  /**
   * Get a wallet client for this verbs wallet
   * @description Returns a WalletClient that can be used to send transactions and interact
   * with smart contracts.
   * @param chainId - The chain ID to create the wallet client for
   * @returns Promise resolving to a WalletClient configured for the specified chain
   */
  abstract walletClient(chainId: SupportedChainId): Promise<WalletClient>
}
