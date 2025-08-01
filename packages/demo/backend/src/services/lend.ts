import type { LendTransaction, LendVaultInfo } from '@eth-optimism/verbs-sdk'

import { getVerbs } from '../config/verbs.js'

/**
 * Get available lending vaults
 */
export async function getVaults(): Promise<LendVaultInfo[]> {
  try {
    const verbs = getVerbs()
    const vaults = await verbs.lend.getVaults()
    return vaults
  } catch (error) {
    throw new Error(
      `Failed to fetch vaults: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Get detailed information about a specific vault
 */
export async function getVault(
  vaultAddress: `0x${string}`,
): Promise<LendVaultInfo> {
  try {
    const verbs = getVerbs()
    const vaultInfo = await verbs.lend.getVault(vaultAddress)
    return vaultInfo
  } catch (error) {
    throw new Error(
      `Failed to fetch vault info: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Get vault balance for a specific wallet
 */
export async function getVaultBalance(
  vaultAddress: `0x${string}`,
  walletId: string,
): Promise<{
  balance: bigint
  balanceFormatted: string
  shares: bigint
  sharesFormatted: string
}> {
  try {
    console.log(`[LEND_SERVICE] Getting vault balance for vault ${vaultAddress}, wallet ${walletId}`)
    
    const verbs = getVerbs()

    // Get wallet by user ID
    const wallet = await verbs.getWallet(walletId)
    if (!wallet) {
      console.log(`[LEND_SERVICE] Wallet not found for user ID: ${walletId}`)
      throw new Error(`Wallet not found for user ID: ${walletId}`)
    }

    console.log(`[LEND_SERVICE] Found wallet ${wallet.address}, calling verbs.lend.getVaultBalance`)
    
    // Get vault balance using the lend provider
    const vaultBalance = await verbs.lend.getVaultBalance(vaultAddress, wallet.address)
    
    console.log(`[LEND_SERVICE] Vault balance: ${vaultBalance.balanceFormatted}`)
    
    return vaultBalance
  } catch (error) {
    console.error(`[LEND_SERVICE] Failed to get vault balance:`, error)
    throw new Error(
      `Failed to get vault balance for wallet ${walletId}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
  }
}

/**
 * Deposit/lend tokens to a lending vault
 */
export async function deposit(
  walletId: string,
  amount: number,
  token: string,
): Promise<LendTransaction> {
  try {
    console.log(`[LEND_SERVICE] Starting deposit for wallet ${walletId}, amount ${amount}, token ${token}`)
    
    const verbs = getVerbs()

    // Get wallet by user ID
    const wallet = await verbs.getWallet(walletId)
    if (!wallet) {
      console.log(`[LEND_SERVICE] Wallet not found for user ID: ${walletId}`)
      throw new Error(`Wallet not found for user ID: ${walletId}`)
    }

    console.log(`[LEND_SERVICE] Found wallet ${wallet.address}, calling wallet.lend`)

    // Execute the deposit transaction using wallet.lend()
    // The wallet.lend() method handles token resolution, amount parsing, and decimal conversion
    const lendTransaction = await wallet.lend(
      amount,
      token.toLowerCase(), // Pass token symbol as string
    )

    console.log(`[LEND_SERVICE] Lend transaction completed: ${lendTransaction.hash}`)

    return lendTransaction
  } catch (error) {
    console.error(`[LEND_SERVICE] Deposit failed:`, error)
    throw new Error(
      `Failed to deposit ${amount} ${token} for wallet ${walletId}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
  }
}

/**
 * Execute a prepared lend transaction on-chain
 */
export async function executeLendTransaction(
  walletId: string,
  lendTransaction: LendTransaction,
): Promise<LendTransaction> {
  try {
    console.log(`[LEND_SERVICE] Executing lend transaction for wallet ${walletId}`)
    
    const verbs = getVerbs()

    // Get wallet by user ID
    const wallet = await verbs.getWallet(walletId)
    if (!wallet) {
      console.log(`[LEND_SERVICE] Wallet not found for user ID: ${walletId}`)
      throw new Error(`Wallet not found for user ID: ${walletId}`)
    }

    console.log(`[LEND_SERVICE] Found wallet ${wallet.address}`)

    if (!lendTransaction.transactionData) {
      throw new Error('No transaction data available for execution')
    }

    // Get public client for sending transactions
    const publicClient = verbs.chainManager.getPublicClient(130) // Unichain
    
    // Check wallet ETH balance for gas fees
    console.log('[LEND_SERVICE] Checking wallet ETH balance for gas fees...')
    const ethBalance = await publicClient.getBalance({
      address: wallet.address,
    })
    console.log(`[LEND_SERVICE] Wallet ETH balance: ${ethBalance} wei (${ethBalance / BigInt(10**18)} ETH)`)
    
    // Estimate gas for both transactions
    let totalGasEstimate = BigInt(0)
    
    if (lendTransaction.transactionData.approval) {
      try {
        const approvalGas = await publicClient.estimateGas({
          account: wallet.address,
          to: lendTransaction.transactionData.approval.to as `0x${string}`,
          data: lendTransaction.transactionData.approval.data as `0x${string}`,
          value: BigInt(lendTransaction.transactionData.approval.value),
        })
        console.log(`[LEND_SERVICE] Approval gas estimate: ${approvalGas}`)
        totalGasEstimate += approvalGas
      } catch (error) {
        console.log(`[LEND_SERVICE] Failed to estimate approval gas: ${error}`)
      }
    }
    
    try {
      const depositGas = await publicClient.estimateGas({
        account: wallet.address,
        to: lendTransaction.transactionData.deposit.to as `0x${string}`,
        data: lendTransaction.transactionData.deposit.data as `0x${string}`,
        value: BigInt(lendTransaction.transactionData.deposit.value),
      })
      console.log(`[LEND_SERVICE] Deposit gas estimate: ${depositGas}`)
      totalGasEstimate += depositGas
    } catch (error) {
      console.log(`[LEND_SERVICE] Failed to estimate deposit gas: ${error}`)
    }
    
    // Get current gas price
    const gasPrice = await publicClient.getGasPrice()
    const estimatedGasCost = totalGasEstimate * gasPrice
    console.log(`[LEND_SERVICE] Total estimated gas cost: ${estimatedGasCost} wei (${estimatedGasCost / BigInt(10**18)} ETH)`)
    
    if (ethBalance < estimatedGasCost) {
      const shortfall = estimatedGasCost - ethBalance
      throw new Error(
        `Insufficient ETH for gas fees. Need ${estimatedGasCost / BigInt(10**18)} ETH, but wallet only has ${ethBalance / BigInt(10**18)} ETH. Shortfall: ${shortfall / BigInt(10**18)} ETH`
      )
    }
    
    let depositHash: `0x${string}` = '0x0'

    // Execute approval transaction if needed
    if (lendTransaction.transactionData.approval) {
      console.log('[LEND_SERVICE] Executing approval transaction...')
      try {
        const approvalSignedTx = await wallet.sign(lendTransaction.transactionData.approval)
        const approvalHash = await wallet.send(approvalSignedTx, publicClient)
        console.log(`[LEND_SERVICE] Approval transaction sent: ${approvalHash}`)
        
        // Wait for approval to be mined before proceeding
        await publicClient.waitForTransactionReceipt({ hash: approvalHash })
        console.log('[LEND_SERVICE] Approval transaction confirmed')
      } catch (error) {
        console.error('[LEND_SERVICE] Approval transaction failed:', error)
        throw new Error(`Approval transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    // Execute deposit transaction
    console.log('[LEND_SERVICE] Executing deposit transaction...')
    try {
      const depositSignedTx = await wallet.sign(lendTransaction.transactionData.deposit)
      depositHash = await wallet.send(depositSignedTx, publicClient)
      console.log(`[LEND_SERVICE] Deposit transaction sent: ${depositHash}`)

      // Wait for deposit to be mined
      await publicClient.waitForTransactionReceipt({ hash: depositHash })
      console.log('[LEND_SERVICE] Deposit transaction confirmed')
    } catch (error) {
      console.error('[LEND_SERVICE] Deposit transaction failed:', error)
      throw new Error(`Deposit transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Return the transaction with the real hash
    const result: LendTransaction = {
      ...lendTransaction,
      hash: depositHash,
    }

    console.log(`[LEND_SERVICE] Lend execution completed successfully: ${result.hash}`)
    return result
  } catch (error) {
    console.error(`[LEND_SERVICE] Failed to execute lend transaction:`, error)
    throw new Error(
      `Failed to execute lend transaction for wallet ${walletId}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
  }
}
