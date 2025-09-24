import {
  type LendMarket,
  type LendTransaction,
  SUPPORTED_TOKENS,
  type SupportedChainId,
} from '@eth-optimism/verbs-sdk'
import { chainById } from '@eth-optimism/viem/chains'
import type { Address, Hash } from 'viem'
import { baseSepolia, unichain } from 'viem/chains'

import { getVerbs } from '../config/verbs.js'
import { getUserWallet, getWallet } from './wallet.js'

interface MarketBalanceResult {
  balance: bigint
  balanceFormatted: string
  shares: bigint
  sharesFormatted: string
}

interface FormattedMarketResponse {
  chainId: number
  address: Address
  name: string
  apy: number
  asset: Address
  apyBreakdown: object
  totalAssets: string
  totalShares: string
  fee: number
  owner: Address
  curator: Address
  lastUpdate: number
}

export async function getBlockExplorerUrl(chainId: SupportedChainId): Promise<string> {
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

export async function getMarketBalance(
  vaultAddress: Address,
  walletId: string,
  chainId: SupportedChainId,
): Promise<MarketBalanceResult> {
  const verbs = getVerbs()
  const wallet = await getWallet(walletId)

  if (!wallet) {
    throw new Error(`Wallet not found for user ID: ${walletId}`)
  }

  return verbs.lend.getMarketBalance(
    { address: vaultAddress, chainId },
    wallet.address,
  )
}

export async function formatMarketResponse(
  vault: LendMarket,
): Promise<FormattedMarketResponse> {
  return {
    chainId: vault.chainId,
    address: vault.address,
    name: vault.name,
    apy: vault.apy,
    asset: vault.asset,
    apyBreakdown: vault.apyBreakdown,
    totalAssets: vault.totalAssets.toString(),
    totalShares: vault.totalShares.toString(),
    fee: vault.fee,
    owner: vault.owner,
    curator: vault.curator,
    lastUpdate: vault.lastUpdate,
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

interface OpenPositionParams {
  amount: number
  asset: {
    tokenAddress: Address
    chainId: SupportedChainId
  }
  marketId: {
    address: Address
    chainId: SupportedChainId
  }
  options?: {
    slippage?: number
  }
}

/**
 * Open a lending position
 * @param identifier - Can be either a userId (for authenticated users) or walletId
 * @param params - Position parameters
 * @param isUserWallet - If true, identifier is treated as userId; if false, as walletId
 */
export async function openPosition(
  identifier: string,
  { amount, asset: assetInfo, marketId, options }: OpenPositionParams,
  isUserWallet = false,
): Promise<Hash> {
  // Get wallet based on identifier type
  const wallet = isUserWallet
    ? await getUserWallet(identifier)
    : await getWallet(identifier)

  if (!wallet) {
    throw new Error(
      `Wallet not found for ${isUserWallet ? 'user' : 'wallet'} ID: ${identifier}`,
    )
  }

  const asset = SUPPORTED_TOKENS.find(
    (token) => token.address[assetInfo.chainId] === assetInfo.tokenAddress,
  )
  if (!asset) {
    throw new Error(`Asset not found for token address: ${assetInfo.tokenAddress}`)
  }

  if (!wallet.lend) {
    throw new Error('Lend functionality not configured for this wallet')
  }

  return await wallet.lend.openPosition({
    amount,
    asset,
    marketId,
    options,
  })
}






