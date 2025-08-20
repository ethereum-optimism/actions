import type {
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

import { verbs } from '../config/verbs.js'

const UNICHAIN_ID = 130 as const
const VAULT_DECIMALS = 6
const USDC_ADDRESS = '0x078D782b760474a361dDA0AF3839290b0EF57AD6' as Address
const ETH_DRIP_AMOUNT = 100000000000000000n // 0.1 ETH
const USDC_DRIP_AMOUNT = 1000000000n // 1000 USDC

// TODO: This is a temporary function
// We will refactor and consolidate most of this logic in the sdk.
export async function getOrCreateWallet(
  userId: string,
): Promise<WalletInterface> {
  const wallet = await verbs.getWallet(userId)
  return wallet || verbs.createWallet(userId)
}

// TODO: This is a temporary function
// We will refactor and consolidate most of this logic in the sdk.
export async function getBalance(userId: string): Promise<TokenBalance[]> {
  const wallet = await verbs.getWallet(userId)
  if (!wallet) throw new Error('Wallet not found')

  const tokenBalances = await wallet.getBalance()

  // Try to add vault balances
  try {
    const vaults = await verbs.lend.getVaults()
    const vaultPromises = vaults.map(async (vault) => {
      try {
        const vaultBalance = await verbs.lend.getVaultBalance(
          vault.address,
          wallet.address,
        )
        if (vaultBalance.balance <= 0n) return null

        const formattedBalance = formatUnits(
          vaultBalance.balance,
          VAULT_DECIMALS,
        )
        return {
          symbol: vault.name,
          totalBalance: vaultBalance.balance,
          totalFormattedBalance: formattedBalance,
          chainBalances: [
            {
              chainId: UNICHAIN_ID,
              balance: vaultBalance.balance,
              formattedBalance,
            },
          ],
        } as TokenBalance
      } catch {
        return null
      }
    })

    const vaultBalances = (await Promise.all(vaultPromises)).filter(
      Boolean,
    ) as TokenBalance[]
    return [...tokenBalances, ...vaultBalances]
  } catch {
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
  const isLocalSupersim = env.RPC_URL === 'http://127.0.0.1:9545'

  const wallet = await verbs.getWallet(userId)
  if (!wallet) throw new Error('Wallet not found')

  if (!isLocalSupersim) {
    throw new Error(
      `Wallet fund is coming soon. For now, manually send USDC or ETH to this wallet:\n\n${wallet.address}\n\nFunding is only available in local development with supersim`,
    )
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

  const { dripHash, formattedAmount } = await (tokenType === 'ETH'
    ? dripETH(faucetAdminWalletClient, wallet.address)
    : dripUSDC(faucetAdminWalletClient, wallet.address))

  await publicClient.waitForTransactionReceipt({ hash: dripHash })

  return {
    success: true,
    tokenType,
    to: wallet.address,
    amount: formattedAmount,
  }
}

async function dripETH(walletClient: any, recipientAddress: Address) {
  const dripHash = await writeContract(walletClient, {
    chain: unichain,
    account: walletClient.account,
    address: env.FAUCET_ADDRESS as Address,
    abi: faucetAbi,
    functionName: 'dripETH',
    args: [recipientAddress, ETH_DRIP_AMOUNT],
  })

  return {
    dripHash,
    formattedAmount: formatEther(ETH_DRIP_AMOUNT),
  }
}

async function dripUSDC(walletClient: any, recipientAddress: Address) {
  const dripHash = await writeContract(walletClient, {
    chain: unichain,
    account: walletClient.account,
    address: env.FAUCET_ADDRESS as Address,
    abi: faucetAbi,
    functionName: 'dripERC20',
    args: [recipientAddress, USDC_DRIP_AMOUNT, USDC_ADDRESS],
  })

  return {
    dripHash,
    formattedAmount: formatUnits(USDC_DRIP_AMOUNT, VAULT_DECIMALS),
  }
}

export async function sendTokens(
  walletId: string,
  amount: number,
  recipientAddress: Address,
): Promise<TransactionData> {
  const wallet = await verbs.getWallet(walletId)
  if (!wallet) throw new Error('Wallet not found')
  return wallet.sendTokens(amount, 'usdc', recipientAddress)
}
