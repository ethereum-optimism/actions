import type { LendProvider } from '@/lend/provider.js'
import type { LendReadOperations } from '@/types/lend.js'

/**
 * Bind a lend provider to the Verbs instance with read-only operations
 * @param provider - The lend provider instance
 * @returns LendReadOperations interface with bound methods
 */
export function bindLendProviderToVerbs(
  provider: LendProvider,
): LendReadOperations {
  return {
    /**
     * Get list of available lending markets
     */
    getVaults: () => provider.getVaults(),

    /**
     * Get list of supported network IDs
     */
    supportedNetworkIds: () => provider.supportedNetworkIds(),

    getVault: (_vaultAddress) => {
      throw new Error('Not implemented')
    },

    getVaultBalance: (_vaultAddress, _walletAddress) => {
      throw new Error('Not implemented')
    },
  }
}
