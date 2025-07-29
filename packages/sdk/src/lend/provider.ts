import type { Address } from 'viem'

import type {
  LendOptions,
  LendTransaction,
  LendVaultInfo,
} from '../types/lend.js'

/**
 * Lending provider abstract class
 * @description Base class for lending provider implementations
 */
export abstract class LendProvider {
  /**
   * Supported networks configuration
   * @description Must be implemented by concrete providers
   */
  protected abstract readonly SUPPORTED_NETWORKS: Record<
    string,
    {
      chainId: number
      name: string
      [key: string]: any
    }
  >

  /**
   * Get supported network IDs
   * @description Returns an array of chain IDs that this provider supports
   * @returns Array of supported network chain IDs
   */
  supportedNetworkIds(): number[] {
    return Object.values(this.SUPPORTED_NETWORKS).map(
      (network) => network.chainId,
    )
  }

  /**
   * Lend/supply assets to a market
   * @param asset - Asset token address to lend
   * @param amount - Amount to lend (in wei)
   * @param marketId - Optional specific market ID
   * @param options - Optional lending configuration
   * @returns Promise resolving to lending transaction details
   */
  abstract lend(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction>

  /**
   * Get detailed vault information
   * @param vaultAddress - Vault address
   * @returns Promise resolving to vault information
   */
  abstract getVault(vaultAddress: Address): Promise<LendVaultInfo>

  /**
   * Get list of available vaults
   * @returns Promise resolving to array of vault information
   */
  abstract getVaults(): Promise<LendVaultInfo[]>

  /**
   * Withdraw/redeem assets from a market
   * @param asset - Asset token address to withdraw
   * @param amount - Amount to withdraw (in wei)
   * @param marketId - Optional specific market ID
   * @param options - Optional withdrawal configuration
   * @returns Promise resolving to withdrawal transaction details
   */
  abstract withdraw(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction>
}
