import type { LendVaultInfo } from '@eth-optimism/verbs-sdk'

import { getVerbs } from '../config/verbs.js'

/**
 * Get available lending vaults
 */
export async function getVaults(): Promise<LendVaultInfo[]> {
  try {
    const verbs = getVerbs()
    const vaults = await verbs.lend.getVaults()
    return vaults
  } catch (error) {
    throw new Error(`Failed to fetch vaults: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Get detailed information about a specific vault
 */
export async function getVault(vaultAddress: `0x${string}`): Promise<LendVaultInfo> {
  try {
    const verbs = getVerbs()
    const vaultInfo = await verbs.lend.getVaultInfo(vaultAddress)
    return vaultInfo
  } catch (error) {
    throw new Error(`Failed to fetch vault info: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
