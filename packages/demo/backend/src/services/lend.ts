import type {
  LendMarket,
  LendMarketId,
  LendMarketPosition,
  SupportedChainId,
} from '@eth-optimism/actions-sdk'
import { SUPPORTED_TOKENS } from '@eth-optimism/actions-sdk'
import { chainById } from '@eth-optimism/viem/chains'
import { formatUnits } from 'viem'
import { baseSepolia, unichain } from 'viem/chains'

import { getVerbs } from '../config/actions.js'
import type {
  FormattedMarketResponse,
  PositionParams,
  PositionResponse,
} from '../types/index.js'
import { getWallet } from './wallet.js'

export async function getBlockExplorerUrl(
  chainId: SupportedChainId,
): Promise<string> {
  const chain = chainById[chainId]
  if (!chain) {
    throw new Error(`Chain not found for chainId: ${chainId}`)
  }
  if (chain.id === unichain.id) {
    return 'https://unichain.blockscout.com/op'
  }
  if (chain.id === baseSepolia.id) {
    return `https://base-sepolia.blockscout.com/op`
  }
  return `${chain.blockExplorers?.default.url}/tx` || ''
}

export async function getMarkets(): Promise<LendMarket[]> {
  const verbs = getVerbs()
  return await verbs.lend.getMarkets()
}

export async function getMarket(marketId: LendMarketId): Promise<LendMarket> {
  const verbs = getVerbs()
  return await verbs.lend.getMarket(marketId)
}

export async function getPosition(
  marketId: LendMarketId,
  walletId: string,
): Promise<LendMarketPosition> {
  const wallet = await getWallet(walletId)

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

  const blockExplorerUrl = await getBlockExplorerUrl(marketId.chainId)

  return {
    hash: result.receipt.transactionHash,
    userOpHash: result.userOpHash,
    blockExplorerUrl,
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
