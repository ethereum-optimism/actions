import type { Address } from 'viem'

import type { LendProvider } from '@/lend/provider.js'
import type { WalletLendOperations } from '@/types/lend.js'

/**
 * Bind a lend provider to a wallet instance with full operations
 * @param provider - The lend provider instance
 * @param wallet - Wallet interface with getAddress method
 * @returns WalletLendOperations interface with bound methods
 */
export function bindLendProviderToWallet(
  provider: LendProvider,
  _wallet: { address: Address } | { getAddress: () => Promise<Address> },
): WalletLendOperations {
  return {
    /**
     * Get list of available lending markets
     * TODO: In future, filter by wallet's assets
     */
    getMarkets: () => provider.getMarkets(),

    /**
     * Get list of supported network IDs
     */
    supportedNetworkIds: () => provider.supportedNetworkIds(),

    // TODO: Implement these methods
    getVault: (_vaultAddress) => {
      throw new Error('Not implemented')
    },

    getVaultBalance: (_vaultAddress, _walletAddress) => {
      throw new Error('Not implemented')
    },

    lend: async (_asset, _amount, _marketId, _options) => {
      throw new Error('Not implemented')
    },

    deposit: async (_asset, _amount, _marketId, _options) => {
      throw new Error('Not implemented')
    },

    withdraw: async (_asset, _amount, _marketId, _options) => {
      throw new Error('Not implemented')
    },
  }
}
