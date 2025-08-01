import type { LendTransaction, LendVaultInfo } from '@eth-optimism/verbs-sdk'

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
    throw new Error(
      `Failed to fetch vaults: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Get detailed information about a specific vault
 */
export async function getVault(
  vaultAddress: `0x${string}`,
): Promise<LendVaultInfo> {
  try {
    const verbs = getVerbs()
    const vaultInfo = await verbs.lend.getVault(vaultAddress)
    return vaultInfo
  } catch (error) {
    throw new Error(
      `Failed to fetch vault info: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Deposit/lend tokens to a lending vault
 */
export async function deposit(
  walletId: string,
  amount: number,
  token: string,
): Promise<LendTransaction> {
  try {
    const verbs = getVerbs()

    // Get wallet by user ID
    const wallet = await verbs.getWallet(walletId)
    if (!wallet) {
      throw new Error(`Wallet not found for user ID: ${walletId}`)
    }

    // Execute the deposit transaction using wallet.lend()
    // The wallet.lend() method handles token resolution, amount parsing, and decimal conversion
    const lendTransaction = await wallet.lend(
      amount,
      token.toLowerCase(), // Pass token symbol as string
    )

    return lendTransaction
  } catch (error) {
    throw new Error(
      `Failed to deposit ${amount} ${token} for wallet ${walletId}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
  }
}
