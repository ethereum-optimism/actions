import type { Address, LocalAccount } from 'viem'
import type { WebAuthnAccount } from 'viem/account-abstraction'

import type { SmartWallet } from '@/wallet/core/wallets/smart/abstract/SmartWallet.js'

/**
 * Base smart wallet provider interface
 * @description Abstract interface for smart wallet providers.
 */
export abstract class SmartWalletProvider {
  /**
   * Create a new smart wallet instance
   * @description Creates a new smart wallet that will be deployed on first transaction.
   * The wallet address is deterministically calculated from owners and nonce.
   * @param params - Wallet creation parameters
   * @param params.owners - Array of wallet owners (addresses or WebAuthn public keys)
   * @param params.signer - Local account used for signing transactions
   * @param params.nonce - Optional nonce for address generation (defaults to 0)
   * @returns Promise resolving to a new SmartWallet instance
   */
  abstract createWallet(params: {
    owners: Array<Address | WebAuthnAccount>
    signer: LocalAccount
    nonce?: bigint
  }): Promise<SmartWallet>

  /**
   * Get an existing smart wallet instance
   * @description Creates a SmartWallet instance for an already deployed wallet.
   * Use this when you know the wallet address and want to interact with it.
   * @param params - Wallet retrieval parameters
   * @param params.walletAddress - Address of the deployed smart wallet
   * @param params.signer - Local account used for signing transactions
   * @param params.ownerIndex - Index of the signer in the wallet's owner list (defaults to 0)
   * @returns SmartWallet instance for the existing wallet
   */
  abstract getWallet(params: {
    walletAddress: Address
    signer: LocalAccount
    ownerIndex?: number
  }): Promise<SmartWallet>

  /**
   * Get the predicted smart wallet address
   * @description Calculates the deterministic address where a smart wallet would be deployed
   * given the specified owners and nonce. Uses CREATE2 for address prediction.
   * @param params - Address prediction parameters
   * @param params.owners - Array of wallet owners (addresses or WebAuthn public keys)
   * @param params.nonce - Nonce for address generation (defaults to 0)
   * @returns Promise resolving to the predicted wallet address
   */
  abstract getWalletAddress(params: {
    owners: Array<Address | WebAuthnAccount>
    nonce?: bigint
  }): Promise<Address>
}
