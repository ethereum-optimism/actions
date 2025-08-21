import type {
  LendTransaction,
  LendVaultInfo,
  SmartWallet,
  SupportedChainId,
} from '@eth-optimism/verbs-sdk'
import type { Address, PublicClient } from 'viem'

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
  const { wallet } = await getWallet(walletId)

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
  const { wallet, privyWallet } = await getWallet(walletId)

  if (!wallet) {
    throw new Error(`Wallet not found for user ID: ${walletId}`)
  }

  if (!lendTransaction.transactionData) {
    throw new Error('No transaction data available for execution')
  }

  const publicClient = verbs.chainManager.getPublicClient(130)
  const ethBalance = await publicClient.getBalance({
    address: privyWallet.address,
  })

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
    const approvalSignedTx = await signOnly(
      walletId,
      lendTransaction.transactionData.approval,
    )
    const approvalHash = await wallet.send(approvalSignedTx, publicClient)
    await publicClient.waitForTransactionReceipt({ hash: approvalHash })
  }

  const depositSignedTx = await signOnly(
    walletId,
    lendTransaction.transactionData.deposit,
  )
  depositHash = await wallet.send(depositSignedTx, publicClient)
  await publicClient.waitForTransactionReceipt({ hash: depositHash })

  return { ...lendTransaction, hash: depositHash }
}

async function signOnly(
  walletId: string,
  transactionData: NonNullable<LendTransaction['transactionData']>['deposit'],
): Promise<string> {
  try {
    // Get wallet to determine the from address for gas estimation
    const { wallet, privyWallet } = await getWallet(walletId)
    if (!wallet) {
      throw new Error(`Wallet not found: ${walletId}`)
    }
    const txParams = await wallet.getTxParams(transactionData, 130)

    console.log(
      `[PRIVY_PROVIDER] Complete tx params - Type: ${txParams.type}, Nonce: ${txParams.nonce}, Limit: ${txParams.gasLimit}, MaxFee: ${txParams.maxFeePerGas || 'fallback'}, Priority: ${txParams.maxPriorityFeePerGas || 'fallback'}`,
    )

    const signedTransaction = await privyWallet.signOnly(txParams)
    console.log('Signed transaction', signedTransaction)
    return signedTransaction
  } catch (error) {
    console.error('Error signing transaction', error)
    throw new Error(
      `Failed to sign transaction for wallet ${walletId}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
  }
}

async function estimateGasCost(
  publicClient: PublicClient,
  wallet: SmartWallet,
  lendTransaction: LendTransaction,
): Promise<bigint> {
  let totalGasEstimate = BigInt(0)

  if (lendTransaction.transactionData?.approval) {
    try {
      totalGasEstimate += await wallet.estimateGas(
        lendTransaction.transactionData.approval,
        publicClient.chain!.id as SupportedChainId,
      )
    } catch {
      // Gas estimation failed, continue
    }
  }

  if (lendTransaction.transactionData?.deposit) {
    try {
      totalGasEstimate += await wallet.estimateGas(
        lendTransaction.transactionData.deposit,
        publicClient.chain!.id as SupportedChainId,
      )
    } catch {
      // Gas estimation failed, continue
    }
  }

  const gasPrice = await publicClient.getGasPrice()
  return totalGasEstimate * gasPrice
}
