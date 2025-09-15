import type {
  LendMarket,
  LendMarketId,
  LendTransaction,
  SupportedChainId,
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
  marketId: LendMarketId,
  chainId: SupportedChainId,
): Promise<LendMarket> {
  const verbs = getVerbs()
  return await verbs.lend.getMarket({ id: marketId, chainId })
}

export async function getMarketBalance(
  vaultAddress: Address,
  walletId: string,
): Promise<MarketBalanceResult> {
  const verbs = getVerbs()
  const wallet = await getWallet(walletId)

  if (!wallet) {
    throw new Error(`Wallet not found for user ID: ${walletId}`)
  }

  return verbs.lend.getMarketBalance(vaultAddress, wallet.address)
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

export async function deposit(
  walletId: string,
  amount: number,
  tokenAddress: Address,
  chainId: SupportedChainId,
): Promise<LendTransaction> {
  const wallet = await getWallet(walletId)

  if (!wallet) {
    throw new Error(`Wallet not found for user ID: ${walletId}`)
  }

  if ('lendExecute' in wallet && typeof wallet.lendExecute === 'function') {
    return await wallet.lendExecute(amount, tokenAddress, chainId)
  } else {
    throw new Error(
      'Lend functionality not yet implemented for this wallet type.',
    )
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
