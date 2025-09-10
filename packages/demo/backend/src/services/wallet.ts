import type { WalletProperties } from '@dynamic-labs-wallet/node'
import { ThresholdSignatureScheme } from '@dynamic-labs-wallet/node'
import { DynamicEvmWalletClient } from '@dynamic-labs-wallet/node-evm'
import type {
  SmartWallet,
  TokenBalance,
  TransactionData,
} from '@eth-optimism/verbs-sdk'
import { SUPPORTED_TOKENS } from '@eth-optimism/verbs-sdk'
import type { Address } from 'viem'
import { encodeFunctionData, formatUnits, getAddress } from 'viem'
import { baseSepolia } from 'viem/chains'

import { mintableErc20Abi } from '@/abis/mintableErc20Abi.js'
import { getDynamicClient, getVerbs } from '@/config/verbs.js'

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
  signerAddress: string
  smartWalletAddress: string
}> {
  const verbs = getVerbs()
  const evmClient = getDynamicClient()
  const wallet = await evmClient.createWalletAccount({
    thresholdSignatureScheme: ThresholdSignatureScheme.TWO_OF_TWO,
    backUpToClientShareService: false,
  })
  const verbsDynamicWallet = await verbs.wallet.hostedWalletToVerbsWallet({
    address: wallet.accountAddress,
  })
  const smartWallet = await verbs.wallet.createSmartWallet({
    owners: [verbsDynamicWallet.address],
    signer: verbsDynamicWallet.signer,
  })
  const smartWalletAddress = smartWallet.address
  return {
    signerAddress: smartWallet.signer.address,
    smartWalletAddress,
  }
}

export async function getWallet(address: Address): Promise<SmartWallet | null> {
  const verbs = getVerbs()
  const evmClient = getDynamicClient()
  const dynamicWallet = await evmClient
    .getWallet({
      accountAddress: address,
    })
    .catch(() => null)
  if (!dynamicWallet) {
    return dynamicWallet
  }
  const verbsDynamicWallet = await verbs.wallet.hostedWalletToVerbsWallet({
    address: dynamicWallet.accountAddress,
  })
  const wallet = await verbs.wallet.getSmartWallet({
    signer: verbsDynamicWallet.signer,
    deploymentOwners: [getAddress(verbsDynamicWallet.address)],
  })
  return wallet
}

export async function getAllWallets(
  _options?: GetAllWalletsOptions,
): Promise<Array<{ wallet: SmartWallet; id: string }>> {
  try {
    const verbs = getVerbs()
    const evmClient = await authenticatedDynamicEvmClient()
    const wallets = await evmClient.getEvmWallets()
    return Promise.all(
      wallets.map(async (dynamicWallet: WalletProperties) => {
        const verbsDynamicWallet = await verbs.wallet.hostedWalletToVerbsWallet(
          {
            address: dynamicWallet.accountAddress,
          },
        )
        const wallet = await verbs.wallet.getSmartWallet({
          signer: verbsDynamicWallet.signer,
          deploymentOwners: [getAddress(verbsDynamicWallet.address)],
        })
        return {
          wallet,
          id: dynamicWallet.accountAddress,
        }
      }),
    )
  } catch {
    throw new Error('Failed to get all wallets')
  }
}

export async function getBalance(
  walletAddress: Address,
): Promise<TokenBalance[]> {
  const wallet = await getWallet(walletAddress)
  if (!wallet) {
    throw new Error('Wallet not found')
  }

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
            vault.address,
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

export async function fundWallet(walletAddress: Address): Promise<{
  success: boolean
  to: string
  amount: string
}> {
  const wallet = await getWallet(walletAddress)
  if (!wallet) {
    throw new Error('Wallet not found')
  }

  const amountInDecimals = BigInt(Math.floor(parseFloat('100') * 1000000))

  const calls = [
    {
      to: SUPPORTED_TOKENS.USDC_DEMO.addresses[baseSepolia.id]!,
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
  walletId: Address,
  amount: number,
  recipientAddress: Address,
): Promise<TransactionData> {
  const wallet = await getWallet(walletId)
  if (!wallet) {
    throw new Error('Wallet not found')
  }

  return wallet.sendTokens(amount, 'usdc', recipientAddress)
}

export const authenticatedDynamicEvmClient = async () => {
  const client = new DynamicEvmWalletClient({
    authToken: process.env.DYNAMIC_AUTH_TOKEN!,
    environmentId: process.env.DYNAMIC_ENVIRONMENT_ID!,
  })
  await client.authenticateApiToken(process.env.DYNAMIC_AUTH_TOKEN!)
  return client
}
