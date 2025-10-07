import type {
  EOATransactionReceipt,
  LendMarket,
  LendMarketId,
  LendMarketPosition,
  LendTransactionReceipt,
  SupportedChainId,
  UserOperationTransactionReceipt,
} from '@eth-optimism/actions-sdk'
import { SUPPORTED_TOKENS } from '@eth-optimism/actions-sdk'
import { chainById } from '@eth-optimism/viem/chains'
import { formatUnits } from 'viem'
import { baseSepolia, unichain } from 'viem/chains'

import { getActions } from '../config/actions.js'
import type {
  FormattedMarketResponse,
  PositionParams,
  PositionResponse,
} from '../types/index.js'
import { getWallet } from './wallet.js'

export async function getBlockExplorerUrls(
  chainId: SupportedChainId,
  transactionHashes?: string[],
  userOpHash?: string,
): Promise<string[]> {
  const chain = chainById[chainId]
  if (!chain) {
    throw new Error(`Chain not found for chainId: ${chainId}`)
  }
  let url = `${chain.blockExplorers?.default.url}`
  if (chain.id === unichain.id) {
    url = `https://unichain.blockscout.com`
  }
  if (chain.id === baseSepolia.id) {
    url = `https://base-sepolia.blockscout.com`
  }

  if (userOpHash) {
    return [`${url}/op/${userOpHash}`]
  }
  if (!transactionHashes) {
    throw new Error('Transaction hashes not found')
  }
  return transactionHashes.map((hash) => `${url}/tx/${hash}`)
}

export async function getMarkets(): Promise<LendMarket[]> {
  const actions = getActions()
  return await actions.lend.getMarkets()
}

export async function getMarket(marketId: LendMarketId): Promise<LendMarket> {
  const actions = getActions()
  return await actions.lend.getMarket(marketId)
}

export async function getPosition(
  marketId: LendMarketId,
  walletId: string,
): Promise<LendMarketPosition> {
  // Try to get wallet as authenticated user first (for Privy user IDs like did:privy:...)
  let wallet = await getWallet(walletId, true)

  // If not found, try as direct wallet ID (legacy behavior)
  if (!wallet) {
    wallet = await getWallet(walletId, false)
  }

  if (!wallet) {
    throw new Error(`Wallet not found for user ID: ${walletId}`)
  }

  return wallet.lend!.getPosition({ marketId })
}

export async function formatMarketResponse(
  market: LendMarket,
): Promise<FormattedMarketResponse> {
  return {
    marketId: market.marketId,
    name: market.name,
    asset: market.asset,
    supply: {
      totalAssets: formatUnits(
        market.supply.totalAssets,
        market.asset.metadata.decimals,
      ),
      totalShares: formatUnits(market.supply.totalShares, 18),
    },
    apy: market.apy,
    metadata: market.metadata,
  }
}

export async function formatMarketBalanceResponse(
  balance: LendMarketPosition,
): Promise<{
  balance: string
  balanceFormatted: string
  shares: string
  sharesFormatted: string
}> {
  return {
    balance: balance.balanceFormatted,
    balanceFormatted: balance.balanceFormatted,
    shares: balance.sharesFormatted,
    sharesFormatted: balance.sharesFormatted,
  }
}

async function executePosition(
  params: PositionParams,
  operation: 'open' | 'close',
): Promise<PositionResponse> {
  const { userId, amount, tokenAddress, marketId, isUserWallet } = params

  const wallet = await getWallet(userId, isUserWallet)
  if (!wallet) {
    throw new Error(
      `Wallet not found for ${isUserWallet ? 'user' : 'wallet'} ID: ${userId}`,
    )
  }

  const asset = SUPPORTED_TOKENS.find(
    (token) =>
      token.address[marketId.chainId as SupportedChainId] === tokenAddress,
  )
  if (!asset) {
    throw new Error(`Asset not found for token address: ${tokenAddress}`)
  }

  const positionParams = { amount, asset, marketId }

  const result =
    operation === 'open'
      ? await wallet.lend!.openPosition(positionParams)
      : await wallet.lend!.closePosition(positionParams)

  const transactionHashes = isEOATransactionReceipt(result)
    ? [result.transactionHash]
    : isBatchEOATransactionReceipt(result)
      ? result.map((receipt) => receipt.transactionHash)
      : undefined
  const blockExplorerUrls = await getBlockExplorerUrls(
    marketId.chainId,
    transactionHashes,
    isUserOperationTransactionReceipt(result) ? result.userOpHash : undefined,
  )

  return {
    transactionHashes,
    userOpHash: isUserOperationTransactionReceipt(result)
      ? result.userOpHash
      : undefined,
    blockExplorerUrls,
    amount,
    tokenAddress,
    marketId,
  }
}

export async function openPosition(
  params: PositionParams,
): Promise<PositionResponse> {
  return executePosition(params, 'open')
}

export async function closePosition(
  params: PositionParams,
): Promise<PositionResponse> {
  return executePosition(params, 'close')
}

function isEOATransactionReceipt(
  receipt: LendTransactionReceipt,
): receipt is EOATransactionReceipt {
  return !Array.isArray(receipt) && !('userOpHash' in receipt)
}

function isUserOperationTransactionReceipt(
  receipt: LendTransactionReceipt,
): receipt is UserOperationTransactionReceipt {
  return 'userOpHash' in receipt
}

function isBatchEOATransactionReceipt(
  receipt: LendTransactionReceipt,
): receipt is EOATransactionReceipt[] {
  return Array.isArray(receipt)
}
