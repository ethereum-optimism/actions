import type { LendTransaction, LendVaultInfo } from '@eth-optimism/verbs-sdk'
import type { Address } from 'viem'

import { verbs } from '../config/verbs.js'

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

export const getVaults = (): Promise<LendVaultInfo[]> => verbs.lend.getVaults()

export const getVault = (vaultAddress: Address): Promise<LendVaultInfo> =>
  verbs.lend.getVault(vaultAddress)

export async function getVaultBalance(
  vaultAddress: Address,
  walletId: string,
): Promise<VaultBalanceResult> {
  const wallet = await verbs.getWallet(walletId)
  if (!wallet) throw new Error(`Wallet not found for user ID: ${walletId}`)
  return verbs.lend.getVaultBalance(vaultAddress, wallet.address)
}

export const formatVaultResponse = (
  vault: LendVaultInfo,
): FormattedVaultResponse => ({
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
})

export const formatVaultBalanceResponse = (balance: VaultBalanceResult) => ({
  balance: balance.balance.toString(),
  balanceFormatted: balance.balanceFormatted,
  shares: balance.shares.toString(),
  sharesFormatted: balance.sharesFormatted,
})

export async function deposit(
  walletId: string,
  amount: number,
  token: string,
): Promise<LendTransaction> {
  const wallet = await verbs.getWallet(walletId)
  if (!wallet) throw new Error(`Wallet not found for user ID: ${walletId}`)
  return wallet.lend(amount, token.toLowerCase())
}

// TODO: This is a temporary function
// We will refactor and consolidate most of this logic in the sdk.
export async function executeLendTransaction(
  walletId: string,
  lendTransaction: LendTransaction,
): Promise<LendTransaction> {
  const wallet = await verbs.getWallet(walletId)
  if (!wallet) throw new Error(`Wallet not found for user ID: ${walletId}`)
  if (!lendTransaction.transactionData)
    throw new Error('No transaction data available for execution')

  const publicClient = verbs.chainManager.getPublicClient(130)
  const ethBalance = await publicClient.getBalance({ address: wallet.address })
  const gasEstimate = await estimateGasCost(
    publicClient,
    wallet,
    lendTransaction,
  )

  if (ethBalance < gasEstimate) throw new Error('Insufficient ETH for gas fees')

  // Handle approval transaction if needed
  if (lendTransaction.transactionData.approval) {
    const approvalSignedTx = await wallet.sign(
      lendTransaction.transactionData.approval,
    )
    const approvalHash = await wallet.send(approvalSignedTx, publicClient)
    await publicClient.waitForTransactionReceipt({ hash: approvalHash })
  }

  // Execute deposit transaction
  const depositSignedTx = await wallet.sign(
    lendTransaction.transactionData.deposit,
  )
  const depositHash = await wallet.send(depositSignedTx, publicClient)
  await publicClient.waitForTransactionReceipt({ hash: depositHash })

  return { ...lendTransaction, hash: depositHash }
}

// TODO: This is a temporary function
// We will refactor and consolidate most of this logic in the sdk.
async function estimateGasCost(
  publicClient: { estimateGas: Function; getGasPrice: Function },
  wallet: { address: Address },
  lendTransaction: LendTransaction,
): Promise<bigint> {
  let totalGasEstimate = 0n
  const { transactionData } = lendTransaction

  // Estimate approval gas if needed
  if (transactionData?.approval) {
    try {
      const approvalGas = await publicClient.estimateGas({
        account: wallet.address,
        to: transactionData.approval.to,
        data: transactionData.approval.data,
        value: BigInt(transactionData.approval.value),
      })
      totalGasEstimate += approvalGas
    } catch {
      // Gas estimation failed, continue
    }
  }

  // Estimate deposit gas
  if (transactionData?.deposit) {
    try {
      const depositGas = await publicClient.estimateGas({
        account: wallet.address,
        to: transactionData.deposit.to,
        data: transactionData.deposit.data,
        value: BigInt(transactionData.deposit.value),
      })
      totalGasEstimate += depositGas
    } catch {
      // Gas estimation failed, continue
    }
  }

  const gasPrice = await publicClient.getGasPrice()
  return totalGasEstimate * gasPrice
}
