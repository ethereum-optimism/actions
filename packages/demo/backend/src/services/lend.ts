import type { LendTransaction, LendVaultInfo } from '@eth-optimism/verbs-sdk'
import type { Address } from 'viem'

import { getVerbs } from '../config/verbs.js'

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
  const wallet = await verbs.getWallet(walletId)

  if (!wallet) {
    throw new Error(`Wallet not found for user ID: ${walletId}`)
  }

  return await verbs.lend.getVaultBalance(vaultAddress, wallet.address)
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
): Promise<LendTransaction> {
  const verbs = getVerbs()
  const wallet = await verbs.getWallet(walletId)

  if (!wallet) {
    throw new Error(`Wallet not found for user ID: ${walletId}`)
  }

  return await wallet.lend(amount, token.toLowerCase())
}

export async function executeLendTransaction(
  walletId: string,
  lendTransaction: LendTransaction,
): Promise<LendTransaction> {
  const verbs = getVerbs()
  const wallet = await verbs.getWallet(walletId)

  if (!wallet) {
    throw new Error(`Wallet not found for user ID: ${walletId}`)
  }

  if (!lendTransaction.transactionData) {
    throw new Error('No transaction data available for execution')
  }

  const publicClient = verbs.chainManager.getPublicClient(84532) // Base Sepolia
  const ethBalance = await publicClient.getBalance({ address: wallet.address })

  const gasEstimate = await estimateGasCost(
    publicClient,
    wallet,
    lendTransaction,
  )

  if (ethBalance < gasEstimate) {
    throw new Error('Insufficient ETH for gas fees')
  }

  let depositHash: Address = '0x0'

  if (lendTransaction.transactionData.approval) {
    const approvalSignedTx = await wallet.sign(
      lendTransaction.transactionData.approval,
    )
    const approvalHash = await wallet.send(approvalSignedTx, publicClient)
    await publicClient.waitForTransactionReceipt({ hash: approvalHash })
  }

  const depositSignedTx = await wallet.sign(
    lendTransaction.transactionData.deposit,
  )
  depositHash = await wallet.send(depositSignedTx, publicClient)
  await publicClient.waitForTransactionReceipt({ hash: depositHash })

  return { ...lendTransaction, hash: depositHash }
}

async function estimateGasCost(
  publicClient: { estimateGas: Function; getGasPrice: Function },
  wallet: { address: Address },
  lendTransaction: LendTransaction,
): Promise<bigint> {
  let totalGasEstimate = BigInt(0)

  if (lendTransaction.transactionData?.approval) {
    try {
      const approvalGas = await publicClient.estimateGas({
        account: wallet.address,
        to: lendTransaction.transactionData.approval.to,
        data: lendTransaction.transactionData.approval.data,
        value: BigInt(lendTransaction.transactionData.approval.value),
      })
      totalGasEstimate += approvalGas
    } catch {
      // Gas estimation failed, continue
    }
  }

  if (lendTransaction.transactionData?.deposit) {
    try {
      const depositGas = await publicClient.estimateGas({
        account: wallet.address,
        to: lendTransaction.transactionData.deposit.to,
        data: lendTransaction.transactionData.deposit.data,
        value: BigInt(lendTransaction.transactionData.deposit.value),
      })
      totalGasEstimate += depositGas
    } catch {
      // Gas estimation failed, continue
    }
  }

  const gasPrice = await publicClient.getGasPrice()
  return totalGasEstimate * gasPrice
}
