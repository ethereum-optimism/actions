import type { LendProvider } from '@/lend/provider.js'
import type { LendReadOperations, LendVaultInfo } from '@/types/lend.js'

/**
 * Bind a lend provider to the Verbs instance with read-only operations
 * @param provider - The lend provider instance
 * @returns LendReadOperations interface with bound methods
 */
export function bindLendProviderToVerbs(provider: LendProvider): LendReadOperations {
  return {
    /**
     * Get list of available lending markets
     */
    markets: () => provider.markets(),

    // TODO: Implement these methods
    getVault: (vaultAddress) => {
      throw new Error('Not implemented')
    },

    getVaultBalance: (vaultAddress, walletAddress) => {
      throw new Error('Not implemented')
    },
  }
}