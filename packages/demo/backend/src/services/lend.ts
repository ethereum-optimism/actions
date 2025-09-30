import {
  type LendMarket,
  SUPPORTED_TOKENS,
  type SupportedChainId,
} from '@eth-optimism/verbs-sdk'
import { chainById } from '@eth-optimism/viem/chains'
import type { Address } from 'viem'
import { baseSepolia, unichain } from 'viem/chains'

import { getVerbs } from '../config/verbs.js'
import { getWallet } from './wallet.js'

interface MarketBalanceResult {
  balance: bigint
  balanceFormatted: string
  shares: bigint
  sharesFormatted: string
}

interface FormattedMarketResponse {
  marketId: {
    chainId: number
    address: Address
  }
  name: string
  asset: {
    address: Partial<Record<SupportedChainId, Address>>
    metadata: {
      symbol: string
      name: string
      decimals: number
    }
    type: string
  }
  supply: {
    totalAssets: string
    totalShares: string
  }
  apy: {
    total: number
    native: number
    totalRewards: number
    performanceFee: number
    usdc?: number
    morpho?: number
    other?: number
  }
  metadata: {
    owner: Address
    curator: Address
    fee: number
    lastUpdate: number
  }
}

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

export async function getMarket(
  marketId: Address,
  chainId: SupportedChainId,
): Promise<LendMarket> {
  const verbs = getVerbs()
  return await verbs.lend.getMarket({ address: marketId, chainId })
}

export async function getPosition(
  vaultAddress: Address,
  walletId: string,
  chainId: SupportedChainId,
): Promise<MarketBalanceResult> {
  const wallet = await getWallet(walletId)

  if (!wallet) {
    throw new Error(`Wallet not found for user ID: ${walletId}`)
  }

  return wallet.lend!.getPosition({
    marketId: { address: vaultAddress, chainId },
  })
}

export async function formatMarketResponse(
  vault: LendMarket,
): Promise<FormattedMarketResponse> {
  return {
    marketId: vault.marketId,
    name: vault.name,
    asset: vault.asset,
    supply: {
      totalAssets: vault.supply.totalAssets.toString(),
      totalShares: vault.supply.totalShares.toString(),
    },
    apy: vault.apy,
    metadata: vault.metadata,
  }
}

export async function formatMarketBalanceResponse(
  balance: MarketBalanceResult,
): Promise<{
  balance: string
  balanceFormatted: string
  shares: string
  sharesFormatted: string
}> {
  return {
    balance: balance.balance.toString(),
    balanceFormatted: balance.balanceFormatted,
    shares: balance.shares.toString(),
    sharesFormatted: balance.sharesFormatted,
  }
}

interface PositionParams {
  userId: string
  amount: number
  tokenAddress: Address
  chainId: SupportedChainId
  vaultAddress: Address
  isUserWallet?: boolean
}

interface PositionResponse {
  hash: string
  blockExplorerUrl: string
  amount: number
  tokenAddress: Address
  chainId: number
  vaultAddress: Address
}

async function executePosition(
  params: PositionParams,
  operation: 'open' | 'close',
): Promise<PositionResponse> {
  const { userId, amount, tokenAddress, chainId, vaultAddress, isUserWallet } =
    params

  const wallet = await getWallet(userId, isUserWallet)
  if (!wallet) {
    throw new Error(
      `Wallet not found for ${isUserWallet ? 'user' : 'wallet'} ID: ${userId}`,
    )
  }

  const asset = SUPPORTED_TOKENS.find(
    (token) => token.address[chainId] === tokenAddress,
  )
  if (!asset) {
    throw new Error(`Asset not found for token address: ${tokenAddress}`)
  }

  const marketId = { address: vaultAddress, chainId }
  const positionParams = { amount, asset, marketId }

  const hash =
    operation === 'open'
      ? await wallet.lend!.openPosition(positionParams)
      : await wallet.lend!.closePosition(positionParams)

  const blockExplorerUrl = await getBlockExplorerUrl(chainId)

  return {
    hash,
    blockExplorerUrl,
    amount,
    tokenAddress,
    chainId,
    vaultAddress,
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
