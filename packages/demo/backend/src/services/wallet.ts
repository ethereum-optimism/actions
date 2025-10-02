import type {
  SmartWallet,
  TokenBalance,
  TransactionData,
} from '@eth-optimism/verbs-sdk'
import {
  getAssetAddress,
  getTokenBySymbol,
  SUPPORTED_TOKENS,
} from '@eth-optimism/verbs-sdk'
import type { Address } from 'viem'
import { encodeFunctionData, formatUnits, getAddress } from 'viem'
import { baseSepolia } from 'viem/chains'

import { mintableErc20Abi } from '@/abis/mintableErc20Abi.js'
import { USDC } from '@/config/assets.js'
import { getPrivyClient, getVerbs } from '@/config/verbs.js'

/**
 * Options for getting all wallets
 * @description Parameters for filtering and paginating wallet results
 */
export interface GetAllWalletsOptions {
  /** Maximum number of wallets to return */
  limit?: number
  /** Cursor for pagination */
  cursor?: string
}

export async function createWallet(): Promise<{
  privyAddress: string
  smartWalletAddress: string
}> {
  const verbs = getVerbs()
  const privyClient = getPrivyClient()
  const privyWallet = await privyClient.walletApi.createWallet({
    chainType: 'ethereum',
  })
  const privySigner = await verbs.wallet.createSigner({
    walletId: privyWallet.id,
    address: getAddress(privyWallet.address),
  })
  const { wallet } = await verbs.wallet.createSmartWallet({
    owners: [privySigner.address],
    signer: privySigner,
  })
  const smartWalletAddress = wallet.address
  return {
    privyAddress: wallet.signer.address,
    smartWalletAddress,
  }
}

export async function getWallet(
  userId: string,
  isAuthedUser = false,
): Promise<SmartWallet | null> {
  const verbs = getVerbs()
  const privyClient = getPrivyClient()

  let privyWallet
  if (isAuthedUser) {
    // Get wallet via user ID (for authenticated users)
    const privyUser = await privyClient.getUserById(userId)
    if (!privyUser) {
      return null
    }
    privyWallet = privyUser.wallet
  } else {
    // Get wallet directly via wallet ID (legacy behavior)
    privyWallet = await privyClient.walletApi
      .getWallet({
        id: userId,
      })
      .catch(() => null)
  }

  if (!privyWallet) {
    return null
  }

  const privySigner = await verbs.wallet.createSigner({
    walletId: privyWallet.id!,
    address: getAddress(privyWallet.address),
  })
  const wallet = await verbs.wallet.getSmartWallet({
    signer: privySigner,
    owners: [privySigner.address],
    deploymentOwners: [getAddress(privyWallet.address)],
  })

  if (!wallet.lend) {
    throw new Error('Lend functionality not configured for this wallet')
  }

  return wallet
}

export async function getAllWallets(
  options?: GetAllWalletsOptions,
): Promise<Array<{ wallet: SmartWallet; id: string }>> {
  try {
    const verbs = getVerbs()
    const privyClient = getPrivyClient()
    const response = await privyClient.walletApi.getWallets(options)
    return Promise.all(
      response.data.map(async (privyWallet) => {
        const privySigner = await verbs.wallet.createSigner({
          walletId: privyWallet.id,
          address: getAddress(privyWallet.address),
        })
        const wallet = await verbs.wallet.getSmartWallet({
          signer: privySigner,
          owners: [privySigner.address],
          deploymentOwners: [privySigner.address],
        })
        return {
          wallet,
          id: privyWallet.id,
        }
      }),
    )
  } catch {
    throw new Error('Failed to get all wallets')
  }
}

export async function getBalance(userId: string): Promise<TokenBalance[]> {
  const wallet = await getWallet(userId)
  if (!wallet) {
    throw new Error('Wallet not found')
  }
  return getWalletBalance(wallet)
}

export async function getWalletBalance(
  wallet: SmartWallet,
): Promise<TokenBalance[]> {
  // Get regular token balances
  const tokenBalances = await wallet.getBalance().catch((error) => {
    console.error(error)
    throw error
  })

  // Get market balances and add them to the response
  const verbs = getVerbs()
  try {
    const vaults = await verbs.lend.getMarkets()

    const vaultBalances = await Promise.all(
      vaults.map(async (vault) => {
        try {
          const vaultBalance = await wallet.lend!.getPosition({
            marketId: vault.marketId,
          })

          // Only include vaults with non-zero balances
          if (vaultBalance.balance > 0n) {
            // Create a TokenBalance object for the vault
            const formattedBalance = formatUnits(vaultBalance.balance, 6) // Assuming 6 decimals for vault shares

            // Get asset address for the vault's chain
            const assetAddress = getAssetAddress(
              vault.asset,
              vault.marketId.chainId,
            )

            return {
              symbol: `${vault.name}`,
              totalBalance: vaultBalance.balance,
              totalFormattedBalance: formattedBalance,
              chainBalances: [
                {
                  chainId: vaultBalance.marketId.chainId,
                  balance: vaultBalance.balance,
                  tokenAddress: assetAddress,
                  formattedBalance: formattedBalance,
                },
              ],
            } as TokenBalance
          }
          return null
        } catch (error) {
          console.error(error)
          return null
        }
      }),
    )

    // Filter out null values and add vault balances to token balances
    const validVaultBalances = vaultBalances.filter(
      (balance): balance is NonNullable<typeof balance> => balance !== null,
    )

    return [...tokenBalances, ...validVaultBalances]
  } catch {
    // Return just token balances if vault balance fetching fails
    return tokenBalances
  }
}

export async function fundWallet(wallet: SmartWallet): Promise<{
  success: boolean
  to: string
  amount: string
}> {
  const walletAddress = wallet.address

  const amountInDecimals = BigInt(Math.floor(parseFloat('100') * 1000000))

  const calls = [
    {
      to: getTokenBySymbol('USDC_DEMO')!.address[baseSepolia.id]!,
      data: encodeFunctionData({
        abi: mintableErc20Abi,
        functionName: 'mint',
        args: [walletAddress, amountInDecimals],
      }),
      value: 0n,
    },
  ]

  await wallet.sendBatch(calls, baseSepolia.id)

  return {
    success: true,
    to: walletAddress,
    amount: formatUnits(amountInDecimals, 6),
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

  return wallet.sendTokens(amount, USDC, baseSepolia.id, recipientAddress)
}
