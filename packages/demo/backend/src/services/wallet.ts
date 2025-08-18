import type {
  GetAllWalletsOptions,
  TokenBalance,
  TransactionData,
  WalletInterface,
} from '@eth-optimism/verbs-sdk'
import { unichain } from '@eth-optimism/viem/chains'
import {
  PrivyClient,
  type WalletApiWalletResponseType,
} from '@privy-io/server-auth'
import type { Address, Hex } from 'viem'
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  getAddress,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { writeContract } from 'viem/actions'

import { faucetAbi } from '@/abis/faucet.js'
import { env } from '@/config/env.js'

import { getVerbs } from '../config/verbs.js'

export async function createWallet(): Promise<{
  privyAddress: string
  smartWalletAddress: string
}> {
  /**
   * 
   */
  const privy = new PrivyClient(env.PRIVY_APP_ID, env.PRIVY_APP_SECRET)
  const wallet = await privy.walletApi.createWallet({
    chainType: 'ethereum',
  })
  const verbs = getVerbs()
  const addresses = await verbs.createWallet([getAddress(wallet.address)])
  return { privyAddress: wallet.address, smartWalletAddress: addresses[0].address }
}

export async function getWallet(userId: string): Promise<{
  privyWallet: WalletApiWalletResponseType
  wallet: WalletInterface
}> {
  const privy = new PrivyClient(env.PRIVY_APP_ID, env.PRIVY_APP_SECRET)
  const privyWallet = await privy.walletApi.getWallet({ id: userId })
  if (!privyWallet) {
    throw new Error('Wallet not found')
  }
  const verbs = getVerbs()
  const wallet = await verbs.getWallet(
    [getAddress(privyWallet.address)],
  )
  return { privyWallet, wallet }
}

export async function getAllWallets(
  options?: GetAllWalletsOptions,
): Promise<
  Array<{ privyWallet: WalletApiWalletResponseType; wallet: WalletInterface }>
> {
  try {
    const privy = new PrivyClient(env.PRIVY_APP_ID, env.PRIVY_APP_SECRET)
    const response = await privy.walletApi.getWallets({
      limit: options?.limit,
      cursor: options?.cursor,
    })

    return Promise.all(
      response.data.map((wallet) => {
        return getWallet(wallet.id)
      }),
    )
  } catch {
    throw new Error('Failed to retrieve wallets')
  }
}

export async function getBalance(userId: string): Promise<TokenBalance[]> {
  const { wallet } = await getWallet(userId)
  if (!wallet) {
    throw new Error('Wallet not found')
  }

  // Get regular token balances
  const tokenBalances = await wallet.getBalance().catch((error) => {
    console.error(error)
    throw error
  })

  // Get vault balances and add them to the response
  const verbs = getVerbs()
  try {
    const vaults = await verbs.lend.getVaults()

    const vaultBalances = await Promise.all(
      vaults.map(async (vault) => {
        try {
          const vaultBalance = await verbs.lend.getVaultBalance(
            vault.address,
            wallet.address,
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
                  chainId: 130 as const, // Unichain
                  balance: vaultBalance.balance,
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

export async function fundWallet(
  userId: string,
  tokenType: 'ETH' | 'USDC',
): Promise<{
  success: boolean
  tokenType: string
  to: string
  privyAddress: string
  amount: string
}> {
  // TODO: do this a better way
  const isLocalSupersim = env.RPC_URL === 'http://127.0.0.1:9545'

  const { wallet, privyWallet } = await getWallet(userId)
  if (!wallet) {
    throw new Error('Wallet not found')
  }

  if (!isLocalSupersim) {
    throw new Error(`Wallet fund is coming soon. For now, manually send USDC or ETH to this wallet:

${wallet.address}

Funding is only available in local development with supersim`)
  }

  const faucetAdminWalletClient = createWalletClient({
    chain: unichain,
    transport: http(env.RPC_URL),
    account: privateKeyToAccount(env.FAUCET_ADMIN_PRIVATE_KEY as Hex),
  })

  const publicClient = createPublicClient({
    chain: unichain,
    transport: http(env.RPC_URL),
  })

  let dripHash: `0x${string}`
  let privyDripHash: `0x${string}` | undefined
  let amount: bigint
  let formattedAmount: string

  if (tokenType === 'ETH') {
    amount = 100000000000000000n // 0.1 ETH
    formattedAmount = formatEther(amount)
    dripHash = await writeContract(faucetAdminWalletClient, {
      account: faucetAdminWalletClient.account,
      address: env.FAUCET_ADDRESS as Address,
      abi: faucetAbi,
      functionName: 'dripETH',
      args: [wallet.address, amount],
    })
    privyDripHash = await writeContract(faucetAdminWalletClient, {
      account: faucetAdminWalletClient.account,
      address: env.FAUCET_ADDRESS as Address,
      abi: faucetAbi,
      functionName: 'dripETH',
      args: [privyWallet.address as `0x${string}`, amount],
    })
  } else {
    amount = 1000000000n // 1000 USDC
    formattedAmount = formatUnits(amount, 6)
    const usdcAddress = '0x078D782b760474a361dDA0AF3839290b0EF57AD6'
    dripHash = await writeContract(faucetAdminWalletClient, {
      account: faucetAdminWalletClient.account,
      address: env.FAUCET_ADDRESS as Address,
      abi: faucetAbi,
      functionName: 'dripERC20',
      args: [wallet.address, amount, usdcAddress as Address],
    })
  }

  await publicClient.waitForTransactionReceipt({
    hash: dripHash,
  })
  if (privyDripHash) {
    await publicClient.waitForTransactionReceipt({
      hash: privyDripHash,
    })
  }

  return {
    success: true,
    tokenType,
    to: wallet.address,
    privyAddress: privyWallet.address,
    amount: formattedAmount,
  }
}

export async function sendTokens(
  walletId: string,
  amount: number,
  recipientAddress: Address,
): Promise<TransactionData> {
  const { wallet } = await getWallet(walletId)
  if (!wallet) {
    throw new Error('Wallet not found')
  }

  return wallet.sendTokens(amount, 'usdc', recipientAddress)
}
