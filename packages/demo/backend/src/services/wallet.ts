import type {
  EOATransactionReceipt,
  LendMarketId,
  SmartWallet,
  TokenBalance,
  UserOperationTransactionReceipt,
  Wallet,
} from '@eth-optimism/actions-sdk'
import { getTokenBySymbol } from '@eth-optimism/actions-sdk'
import type { WalletWithMetadata } from '@privy-io/server-auth'
import type { Address } from 'viem'
import { encodeFunctionData, formatUnits, getAddress } from 'viem'
import { baseSepolia } from 'viem/chains'

import { mintableErc20Abi } from '@/abis/mintableErc20Abi.js'
import { getActions, getPrivyClient } from '@/config/actions.js'

import { getBlockExplorerUrls } from './lend.js'

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
  const actions = getActions()
  const privyClient = getPrivyClient()
  const privyWallet = await privyClient.walletApi.createWallet({
    chainType: 'ethereum',
  })
  const privySigner = await actions.wallet.createSigner({
    walletId: privyWallet.id,
    address: getAddress(privyWallet.address),
  })
  const { wallet } = await actions.wallet.createSmartWallet({
    signer: privySigner,
  })
  const smartWalletAddress = wallet.address
  return {
    privyAddress: wallet.signer.address,
    smartWalletAddress,
  }
}

export async function getWallet(userId: string): Promise<SmartWallet | null> {
  const actions = getActions()
  const privyClient = getPrivyClient()

  // Get wallet via user ID (for authenticated users)
  const privyUser = await privyClient.getUserById(userId)
  if (!privyUser) {
    return null
  }

  // Get the first embedded ethereum wallet from linked accounts
  const walletAccount = privyUser.linkedAccounts?.find(
    (account): account is WalletWithMetadata =>
      account.type === 'wallet' &&
      account.walletClientType === 'privy' &&
      account.chainType === 'ethereum',
  )

  if (!walletAccount) {
    return null
  }

  const privyWallet = {
    id: walletAccount.id,
    address: walletAccount.address,
  }

  const privySigner = await actions.wallet.createSigner({
    walletId: privyWallet.id!,
    address: getAddress(privyWallet.address),
  })
  const wallet = await actions.wallet.getSmartWallet({
    signer: privySigner,
    deploymentSigners: [getAddress(privyWallet.address)],
  })

  if (!wallet.lend) {
    throw new Error('Lend functionality not configured for this wallet')
  }

  return wallet
}

export async function getWalletBalance(
  wallet: SmartWallet,
): Promise<TokenBalance[]> {
  // Get regular token balances
  const tokenBalances = await wallet.getBalance().catch((error) => {
    console.error(error)
    throw error
  })

  return tokenBalances
}

export async function getLendPosition({
  wallet,
  marketId,
}: {
  marketId: LendMarketId
  wallet: Wallet
}) {
  return wallet.lend!.getPosition({ marketId })
}

export async function fundWallet(wallet: SmartWallet): Promise<{
  success: boolean
  to: string
  amount: string
  transactionHashes?: Address[]
  userOpHash?: Address
  blockExplorerUrls?: string[]
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

  const result = await wallet.sendBatch(calls, baseSepolia.id)

  let transactionHashes: Address[] | undefined
  let userOpHash: Address | undefined

  if (Array.isArray(result)) {
    transactionHashes = result.map(
      (r: EOATransactionReceipt) => r.transactionHash,
    )
  } else if ('userOpHash' in result) {
    userOpHash = (result as UserOperationTransactionReceipt).userOpHash
  } else {
    transactionHashes = [(result as EOATransactionReceipt).transactionHash]
  }

  // Get block explorer URLs
  const blockExplorerUrls = await getBlockExplorerUrls(
    baseSepolia.id,
    transactionHashes,
    userOpHash,
  )

  return {
    success: true,
    to: walletAddress,
    amount: formatUnits(amountInDecimals, 6),
    transactionHashes,
    userOpHash,
    blockExplorerUrls,
  }
}
