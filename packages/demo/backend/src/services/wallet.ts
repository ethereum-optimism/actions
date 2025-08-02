import type {
  GetAllWalletsOptions,
  TokenBalance,
  TransactionData,
  WalletInterface,
} from '@eth-optimism/verbs-sdk'
import { unichain } from '@eth-optimism/viem/chains'
import type { Address, Hex } from 'viem'
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { writeContract } from 'viem/actions'

import { faucetAbi } from '@/abis/faucet.js'
import { env } from '@/config/env.js'

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
        } catch {
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
  amount: string
}> {
  // TODO: do this a better way
  const isLocalSupersim = env.RPC_URL === 'http://127.0.0.1:9545'

  const wallet = await getWallet(userId)
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

  await publicClient.waitForTransactionReceipt({ hash: dripHash })

  return {
    success: true,
    tokenType,
    to: wallet.address,
    amount: formattedAmount,
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
