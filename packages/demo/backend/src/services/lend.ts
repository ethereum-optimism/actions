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

async function getBlockExplorerUrl(chainId: SupportedChainId): Promise<string> {
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

export async function openPositionWithUserWallet(
  userId: string,
  amount: number,
  tokenAddress: Address,
  chainId: SupportedChainId,
  vaultAddress: Address,
): Promise<Hash> {
  const wallet = await getUserWallet(userId)

  if (!wallet) {
    throw new Error(`Wallet not found for user ID: ${userId}`)
  }

  const asset = SUPPORTED_TOKENS.find(
    (token) => token.address[chainId] === tokenAddress,
  )
  if (!asset) {
    throw new Error(`Asset not found for token address: ${tokenAddress}`)
  }

  // Note: wallet.lend.openPosition would be the correct path
  // but requires wallet.lend to be initialized
  if (!wallet.lend) {
    throw new Error('Lend functionality not configured for this wallet')
  }

  return await wallet.lend.openPosition({
    amount,
    asset,
    marketId: { address: vaultAddress, chainId },
  })
}


export async function openPosition(
  walletId: string,
  amount: number,
  tokenAddress: Address,
  chainId: SupportedChainId,
  vaultAddress: Address,
): Promise<Hash> {
  const wallet = await getWallet(walletId)

  if (!wallet) {
    throw new Error(`Wallet not found for user ID: ${walletId}`)
  }

  const asset = SUPPORTED_TOKENS.find(
    (token) => token.address[chainId] === tokenAddress,
  )
  if (!asset) {
    throw new Error(`Asset not found for token address: ${tokenAddress}`)
  }

  // Note: wallet.lend.openPosition would be the correct path
  // but requires wallet.lend to be initialized
  if (!wallet.lend) {
    throw new Error('Lend functionality not configured for this wallet')
  }

  return await wallet.lend.openPosition({
    amount,
    asset,
    marketId: { address: vaultAddress, chainId },
  })
}


export async function executeLendTransactionWithUserWallet(
  userId: string,
  lendTransaction: LendTransaction,
  chainId: SupportedChainId,
): Promise<LendTransaction & { blockExplorerUrl: string }> {
  const wallet = await getUserWallet(userId)

  if (!wallet) {
    throw new Error(`Wallet not found for user ID: ${userId}`)
  }

  if (!lendTransaction.transactionData) {
    throw new Error('No transaction data available for execution')
  }

  const depositHash = lendTransaction.transactionData.approval
    ? await wallet.sendBatch(
        [
          lendTransaction.transactionData.approval,
          lendTransaction.transactionData.deposit,
        ],
        chainId,
      )
    : await wallet.send(lendTransaction.transactionData.deposit, chainId)

  return {
    ...lendTransaction,
    hash: depositHash,
    blockExplorerUrl: await getBlockExplorerUrl(chainId),
  }
}

export async function executeLendTransaction(
  walletId: string,
  lendTransaction: LendTransaction,
  chainId: SupportedChainId,
): Promise<LendTransaction & { blockExplorerUrl: string }> {
  const wallet = await getWallet(walletId)

  if (!wallet) {
    throw new Error(`Wallet not found for user ID: ${walletId}`)
  }

  if (!lendTransaction.transactionData) {
    throw new Error('No transaction data available for execution')
  }

  const depositHash = lendTransaction.transactionData.approval
    ? await wallet.sendBatch(
        [
          lendTransaction.transactionData.approval,
          lendTransaction.transactionData.deposit,
        ],
        chainId,
      )
    : await wallet.send(lendTransaction.transactionData.deposit, chainId)

  return {
    ...lendTransaction,
    hash: depositHash,
    blockExplorerUrl: await getBlockExplorerUrl(chainId),
  }
}
