import type { Address } from 'viem'

import type { Wallet as WalletInterface } from './types/wallet.js'

/**
 * Wallet implementation
 * @description Concrete implementation of the Wallet interface
 */
export class Wallet implements WalletInterface {
  id: string
  address: Address

  /**
   * Create a new wallet instance
   * @param address - Blockchain address
   */
  constructor(address: Address) {
    this.id = '' // Will be determined after creation
    this.address = address
  }

  /**
   * Get wallet balance
   * @description Retrieve the current balance of the wallet
   * @returns Promise resolving to balance in wei
   */
  async getBalance(): Promise<bigint> {
    return 0n // TODO: placeholder
  }
}
