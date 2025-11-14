import { useCallback } from 'react'
import type {
  Asset,
  LendMarketId,
  LendTransactionReceipt,
} from '@eth-optimism/actions-sdk'
import { getAssetAddress } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import type { LendExecutePositionParams } from '@/types/api'
import {
  isBatchEOATransactionReceipt,
  isEOATransactionReceipt,
  isUserOperationTransactionReceipt,
} from '@/utils/receiptTypeGuards'
import { getBlockExplorerUrls } from '@/utils/blockExplorer'

interface UseTransactionHandlerConfig {
  isReady: () => boolean
  marketData: {
    marketId: LendMarketId
    assetAddress: Address
    asset: Asset
  } | null
  openPosition: (params: LendExecutePositionParams) => Promise<LendTransactionReceipt>
  closePosition: (params: LendExecutePositionParams) => Promise<LendTransactionReceipt>
  logActivity: (type: string) => any
  onTransactionComplete: (marketId: LendMarketId) => Promise<void>
}

/**
 * Hook to handle lending/withdrawal transactions
 * Manages the full transaction flow including logging and state updates
 */
export function useTransactionHandler({
  isReady,
  marketData,
  openPosition,
  closePosition,
  logActivity,
  onTransactionComplete,
}: UseTransactionHandlerConfig) {
  const executePosition = useCallback(
    async (operation: 'open' | 'close', amount: number) => {
      if (!isReady() || !marketData) {
        throw new Error('User or market data not available')
      }
      if (!marketData.asset) {
        throw new Error('Market asset data not available')
      }

      const marketId = marketData.marketId
      const asset = marketData.asset
      const tokenAddress = getAssetAddress(asset, marketId.chainId)
      const positionParams = { amount, asset, marketId }

      const activity =
        operation === 'open' ? logActivity('deposit') : logActivity('withdraw')

      const result =
        operation === 'open'
          ? await openPosition(positionParams).catch((error) => {
              activity?.error()
              throw error
            })
          : await closePosition(positionParams).catch((error) => {
              activity?.error()
              throw error
            })

      const transactionHashes = isEOATransactionReceipt(result)
        ? [result.transactionHash]
        : isBatchEOATransactionReceipt(result)
          ? result.map((receipt) => receipt.transactionHash)
          : undefined

      const userOpHash = isUserOperationTransactionReceipt(result)
        ? result.userOpHash
        : undefined

      const blockExplorerUrls = await getBlockExplorerUrls(
        marketId.chainId,
        transactionHashes,
        userOpHash,
      )

      activity?.confirm({
        blockExplorerUrl: blockExplorerUrls.length
          ? blockExplorerUrls[blockExplorerUrls.length - 1]
          : undefined,
      })

      const transaction = {
        transactionHashes,
        userOpHash,
        blockExplorerUrls,
        amount,
        tokenAddress,
        marketId,
      }

      return { transaction }
    },
    [isReady, marketData, openPosition, closePosition, logActivity],
  )

  // Handle transaction (lend or withdraw)
  const handleTransaction = useCallback(
    async (mode: 'lend' | 'withdraw', amount: number) => {
      if (!isReady() || !marketData) {
        throw new Error('User or market data not available')
      }

      const result =
        mode === 'lend'
          ? await executePosition('open', amount)
          : await executePosition('close', amount)

      const txHash =
        result.transaction.userOpHash ||
        (result.transaction.transactionHashes?.length
          ? result.transaction.transactionHashes[
              result.transaction.transactionHashes.length - 1
            ]
          : undefined)

      const explorerUrl = result.transaction.blockExplorerUrls.length
        ? result.transaction.blockExplorerUrls[
            result.transaction.blockExplorerUrls.length - 1
          ]
        : undefined

      // Refresh data after successful transaction
      setTimeout(async () => {
        if (isReady() && marketData) {
          await onTransactionComplete(marketData.marketId)
        }
      }, 1000)

      return {
        transactionHash: txHash,
        blockExplorerUrl: explorerUrl,
      }
    },
    [isReady, marketData, executePosition, onTransactionComplete],
  )

  return {
    handleTransaction,
  }
}
