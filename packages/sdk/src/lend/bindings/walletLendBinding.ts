import type { Address } from 'viem'

import type { LendProvider } from '@/lend/provider.js'
import type { LendReadOperations, LendWriteOperations, WalletLendOperations } from '@/types/lend.js'

/**
 * Bind a lend provider to a wallet instance with full operations
 * @param provider - The lend provider instance
 * @param wallet - Wallet interface with getAddress method
 * @returns WalletLendOperations interface with bound methods
 */
export function bindLendProviderToWallet(
  provider: LendProvider,
  wallet: { getAddress: () => Promise<Address> }
): WalletLendOperations {
  return {
    /**
     * Get list of available lending markets
     * TODO: In future, filter by wallet's assets
     */
    getMarkets: () => provider.getMarkets(),

    // TODO: Implement these methods
    getVault: (vaultAddress) => {
      throw new Error('Not implemented')
    },

    getVaultBalance: (vaultAddress, walletAddress) => {
      throw new Error('Not implemented')
    },

    lend: async (asset, amount, marketId, options) => {
      throw new Error('Not implemented')
    },

    deposit: async (asset, amount, marketId, options) => {
      throw new Error('Not implemented')
    },

    withdraw: async (asset, amount, marketId, options) => {
      throw new Error('Not implemented')
    },
  }
}