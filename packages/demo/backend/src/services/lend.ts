import type {
  LendTransaction,
  LendVaultInfo,
  SupportedChainId,
} from '@eth-optimism/verbs-sdk'
import type { Address } from 'viem'

import { getVerbs } from '../config/verbs.js'
import { getWallet } from './wallet.js'

interface VaultBalanceResult {
  balance: bigint
  balanceFormatted: string
  shares: bigint
  sharesFormatted: string
}

interface FormattedVaultResponse {
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

export async function getVaults(): Promise<LendVaultInfo[]> {
  const verbs = getVerbs()
  return await verbs.lend.getVaults()
}

export async function getVault(vaultAddress: Address): Promise<LendVaultInfo> {
  const verbs = getVerbs()
  return await verbs.lend.getVault(vaultAddress)
}

export async function getVaultBalance(
  vaultAddress: Address,
  walletId: string,
): Promise<VaultBalanceResult> {
  const verbs = getVerbs()
  const { wallet } = await getWallet(walletId)

  if (!wallet) {
    throw new Error(`Wallet not found for user ID: ${walletId}`)
  }

  const walletAddress = await wallet.getAddress()
  return await verbs.lend.getVaultBalance(vaultAddress, walletAddress)
}

export async function formatVaultResponse(
  vault: LendVaultInfo,
): Promise<FormattedVaultResponse> {
  return {
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

export async function formatVaultBalanceResponse(
  balance: VaultBalanceResult,
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
  token: string,
  chainId: SupportedChainId,
): Promise<LendTransaction> {
  const { wallet } = await getWallet(walletId)

  if (!wallet) {
    throw new Error(`Wallet not found for user ID: ${walletId}`)
  }

  return await wallet.lend(amount, token.toLowerCase(), chainId)
}

export async function executeLendTransaction(
  walletId: string,
  lendTransaction: LendTransaction,
  chainId: SupportedChainId,
): Promise<LendTransaction> {
  const { wallet } = await getWallet(walletId)

  if (!wallet) {
    throw new Error(`Wallet not found for user ID: ${walletId}`)
  }

  if (!lendTransaction.transactionData) {
    throw new Error('No transaction data available for execution')
  }

  if (lendTransaction.transactionData.approval) {
    await wallet.send(lendTransaction.transactionData.approval, chainId)
  }

  const depositHash = await wallet.send(
    lendTransaction.transactionData.deposit,
    chainId,
  )

  return { ...lendTransaction, hash: depositHash }
}
