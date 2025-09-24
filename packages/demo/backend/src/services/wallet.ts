import type {
  SmartWallet,
  SupportedChainId,
  TokenBalance,
  TransactionData,
} from '@eth-optimism/verbs-sdk'
import { getTokenBySymbol, SUPPORTED_TOKENS } from '@eth-optimism/verbs-sdk'
import type { Address } from 'viem'
import { encodeFunctionData, formatUnits, getAddress } from 'viem'
import { baseSepolia } from 'viem/chains'

import { mintableErc20Abi } from '@/abis/mintableErc20Abi.js'
import { USDC } from '@/config/assets.js'
import { env } from '@/config/env.js'
import { getTurnkeyClient, getVerbs } from '@/config/verbs.js'
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

async function turnkeyCreateWallet() {
  const turnkeyClient = getTurnkeyClient()
  const activityResponse = await turnkeyClient.apiClient().createWallet({
    walletName: 'ETH Wallet',
    accounts: [
      {
        curve: 'CURVE_SECP256K1',
        pathFormat: 'PATH_FORMAT_BIP32',
        path: "m/44'/60'/0'/0/0",
        addressFormat: 'ADDRESS_FORMAT_ETHEREUM',
      },
    ],
  })
  console.log(activityResponse)
  return activityResponse
}

async function turnkeyGetWallet(walletId: string) {
  const turnkeyClient = getTurnkeyClient()
  const activityResponse = await turnkeyClient.apiClient().getWalletAccount({
    organizationId: env.TURNKEY_ORGANIZATION_ID!,
    walletId: walletId,
  })
  console.log(activityResponse)
  return activityResponse
}

async function turnkeyGetAllWallets() {
  const turnkeyClient = getTurnkeyClient()
  const activityResponse = await turnkeyClient.apiClient().getWallets({
    organizationId: env.TURNKEY_ORGANIZATION_ID!,
  })
  console.log(activityResponse)
  return activityResponse
}

export async function createWallet(): Promise<{
  privyAddress: string
  smartWalletAddress: string
}> {
  const verbs = getVerbs()
  const turnkeyWallet = await turnkeyCreateWallet()
  const verbsPrivyWallet = await verbs.wallet.hostedWalletToVerbsWallet({
    signWith: turnkeyWallet.addresses[0],
  })
  const wallet = await verbs.wallet.createSmartWallet({
    owners: [verbsPrivyWallet.address],
    signer: verbsPrivyWallet.signer,
  })
  const smartWalletAddress = wallet.address
  return {
    privyAddress: wallet.signer.address,
    smartWalletAddress,
  }
}

export async function getWallet(userId: string): Promise<SmartWallet | null> {
  const verbs = getVerbs()
  const turnkeyWallet = await turnkeyGetWallet(userId).catch(() => null)
  if (!turnkeyWallet) {
    return null
  }
  const verbsTurnkeyWallet = await verbs.wallet.hostedWalletToVerbsWallet({
    signWith: turnkeyWallet.account.address,
  })
  const wallet = await verbs.wallet.getSmartWallet({
    signer: verbsTurnkeyWallet.signer,
    deploymentOwners: [getAddress(turnkeyWallet.account.address)],
  })
  return wallet
}

// export async function getUserWallet(
//   userId: string,
// ): Promise<SmartWallet | null> {
//   const verbs = getVerbs()
//   const privyClient = getPrivyClient()
//   const privyUser = await privyClient.getUserById(userId).catch(() => null)
//   if (!privyUser) {
//     return null
//   }
//   const privyWallet = privyUser.wallet
//   if (!privyWallet) {
//     return null
//   }
//   const verbsPrivyWallet = await verbs.wallet.hostedWalletToVerbsWallet({
//     walletId: privyWallet.id!,
//     address: privyWallet.address,
//   })
//   const wallet = await verbs.wallet.getSmartWallet({
//     signer: verbsPrivyWallet.signer,
//     deploymentOwners: [getAddress(privyWallet.address)],
//   })
//   return wallet
// }

export async function getAllWallets(
  _options?: GetAllWalletsOptions,
): Promise<Array<{ wallet: SmartWallet; id: string }>> {
  try {
    const verbs = getVerbs()
    const turnkeyWallets = await turnkeyGetAllWallets()
    return Promise.all(
      turnkeyWallets.wallets.map(async ({ walletId }) => {
        const turnkeyWallet = await turnkeyGetWallet(walletId)
        const verbsTurnkeyWallet = await verbs.wallet.hostedWalletToVerbsWallet(
          {
            signWith: turnkeyWallet.account.address,
          },
        )
        const wallet = await verbs.wallet.getSmartWallet({
          signer: verbsTurnkeyWallet.signer,
          deploymentOwners: [getAddress(turnkeyWallet.account.address)],
        })
        return {
          wallet,
          id: walletId,
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
          const walletAddress = wallet.address
          const vaultBalance = await verbs.lend.getMarketBalance(
            {
              address: vault.address,
              chainId: vault.chainId as SupportedChainId,
            },
            walletAddress,
          )

          // Only include vaults with non-zero balances
          if (vaultBalance.balance > 0n) {
            // Create a TokenBalance object for the vault
            const formattedBalance = formatUnits(vaultBalance.balance, 6) // Assuming 6 decimals for vault shares
            return {
              symbol: `${vault.name}`,
              totalBalance: vaultBalance.balance,
              totalFormattedBalance: formattedBalance,
              chainBalances: [
                {
                  chainId: vaultBalance.chainId,
                  balance: vaultBalance.balance,
                  tokenAddress: vault.asset,
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
