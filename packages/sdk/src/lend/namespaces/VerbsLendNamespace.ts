import type { Address } from 'viem'

import type { LendProvider } from '@/lend/provider.js'
import type { LendVaultInfo } from '@/types/lend.js'

/**
 * Verbs Lend Namespace
 * @description Read-only lending operations available on verbs.lend
 */
export class VerbsLendNamespace {
  constructor(protected readonly provider: LendProvider) {}

  /**
   * Get list of available lending vaults
   */
  getVaults(): Promise<LendVaultInfo[]> {
    return this.provider.getVaults()
  }

  /**
   * Get detailed information for a specific vault
   */
  getVault(vaultAddress: Address): Promise<LendVaultInfo> {
    return this.provider.getVault(vaultAddress)
  }

  /**
   * Get vault balance for a specific wallet
   */
  getVaultBalance(
    vaultAddress: Address,
    walletAddress: Address,
  ): Promise<{
    balance: bigint
    balanceFormatted: string
    shares: bigint
    sharesFormatted: string
    chainId: number
  }> {
    return this.provider.getVaultBalance(vaultAddress, walletAddress)
  }

  /**
   * Get list of supported network IDs
   */
  supportedNetworkIds(): number[] {
    return this.provider.supportedNetworkIds()
  }
}
