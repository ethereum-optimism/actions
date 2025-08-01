import type {
  GetAllWalletsOptions,
  TokenBalance,
  TransactionData,
  WalletInterface,
} from '@eth-optimism/verbs-sdk'
import type { Address } from 'viem'
import { formatUnits } from 'viem'

import { getVerbs } from '../config/verbs.js'

export async function createWallet(userId: string): Promise<WalletInterface> {
  const verbs = getVerbs()
  return await verbs.createWallet(userId)
}

export async function getWallet(
  userId: string,
): Promise<WalletInterface | null> {
  const verbs = getVerbs()
  return await verbs.getWallet(userId)
}

export async function getAllWallets(
  options?: GetAllWalletsOptions,
): Promise<WalletInterface[]> {
  const verbs = getVerbs()
  return await verbs.getAllWallets(options)
}

export async function getOrCreateWallet(
  userId: string,
): Promise<WalletInterface> {
  let wallet = await getWallet(userId)
  if (!wallet) {
    wallet = await createWallet(userId)
  }
  return wallet
}

export async function getBalance(userId: string): Promise<TokenBalance[]> {
  const wallet = await getWallet(userId)
  if (!wallet) {
    throw new Error('Wallet not found')
  }

  // Get regular token balances
  const tokenBalances = await wallet.getBalance()

  // Get vault balances and add them to the response
  const verbs = getVerbs()
  try {
    const vaults = await verbs.lend.getVaults()
    console.log(
      `[WALLET_SERVICE] Found ${vaults.length} vaults to check balances for`,
    )

    const vaultBalances = await Promise.all(
      vaults.map(async (vault) => {
        try {
          const vaultBalance = await verbs.lend.getVaultBalance(
            vault.address,
            wallet.address,
          )

          // Only include vaults with non-zero balances
          if (vaultBalance.balance > 0n) {
            console.log(
              `[WALLET_SERVICE] Found vault balance: ${vault.name} = ${vaultBalance.balanceFormatted}`,
            )

            // Create a TokenBalance object for the vault
            const formattedBalance = formatUnits(vaultBalance.balance, 6) // Assuming 6 decimals for vault shares
            return {
              symbol: `${vault.name}`,
              totalBalance: vaultBalance.balance,
              totalFormattedBalance: formattedBalance,
              chainBalances: [
                {
                  chainId: 130 as const, // Unichain
                  balance: vaultBalance.balance,
                  formattedBalance: formattedBalance,
                },
              ],
            } as TokenBalance
          }
          return null
        } catch (error) {
          console.log(
            `[WALLET_SERVICE] Error checking vault ${vault.name}: ${error}`,
          )
          return null
        }
      }),
    )

    // Filter out null values and add vault balances to token balances
    const validVaultBalances = vaultBalances.filter(
      (balance): balance is NonNullable<typeof balance> => balance !== null,
    )
    console.log(
      `[WALLET_SERVICE] Found ${validVaultBalances.length} non-zero vault balances`,
    )

    return [...tokenBalances, ...validVaultBalances]
  } catch (error) {
    console.error('[WALLET_SERVICE] Error fetching vault balances:', error)
    // Return just token balances if vault balance fetching fails
    return tokenBalances
  }
}

export async function sendTokens(
  walletId: string,
  amount: number,
  recipientAddress: Address,
): Promise<TransactionData> {
  const wallet = await getWallet(walletId)
  if (!wallet) {
    throw new Error('Wallet not found')
  }

  return wallet.sendTokens(amount, 'usdc', recipientAddress)
}
