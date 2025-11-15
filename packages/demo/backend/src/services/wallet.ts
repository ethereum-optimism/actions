import type {
  EOATransactionReceipt,
  LendMarketId,
  SmartWallet,
  UserOperationTransactionReceipt,
  Wallet,
} from '@eth-optimism/actions-sdk'
import { getTokenBySymbol } from '@eth-optimism/actions-sdk'
import type { User } from '@privy-io/node'
import type { Address } from 'viem'
import { encodeFunctionData, formatUnits, getAddress } from 'viem'
import { baseSepolia } from 'viem/chains'

import { mintableErc20Abi } from '@/abis/mintableErc20Abi.js'
import { getActions, getPrivyClient } from '@/config/actions.js'
import { serializeBigInt } from '@/utils/serializers.js'

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

export async function getWallet(idToken: string): Promise<SmartWallet | null> {
  const actions = getActions()
  const privyClient = getPrivyClient()

  const privyUser = await privyClient.users().get({ id_token: idToken })
  if (!privyUser) {
    return null
  }

  // Get the first embedded ethereum wallet from linked accounts
  const walletAccount = privyUser.linked_accounts.find(
    (account): account is User.LinkedAccountEthereumEmbeddedWallet =>
      account.type === 'wallet' &&
      account.wallet_client === 'privy' &&
      account.chain_type === 'ethereum',
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

export async function getWalletBalance(wallet: SmartWallet) {
  // Get regular token balances
  const tokenBalances = await wallet.getBalance().catch((error) => {
    console.error(error)
    throw error
  })

  return serializeBigInt(tokenBalances)
}

export async function getLendPosition({
  wallet,
  marketId,
}: {
  marketId: LendMarketId
  wallet: Wallet
}) {
  const position = await wallet.lend!.getPosition({ marketId })
  return serializeBigInt(position)
}

export async function mintDemoUsdcToWallet(wallet: SmartWallet): Promise<{
  success: boolean
  to: string
  amount: string
  transactionHashes?: Address[]
  userOpHash?: Address
  blockExplorerUrls?: string[]
}> {
  const walletAddress = wallet.address

  const amountInDecimals = BigInt(Math.floor(parseFloat('100') * 1000000))

  const usdcDemoToken = getTokenBySymbol('USDC_DEMO')
  if (!usdcDemoToken) {
    throw new Error('USDC_DEMO token not found in supported tokens')
  }

  const calls = [
    {
      to: usdcDemoToken.address[baseSepolia.id]!,
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
