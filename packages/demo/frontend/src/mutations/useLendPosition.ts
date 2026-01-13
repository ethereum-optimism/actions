import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { LendTransactionReceipt } from '@eth-optimism/actions-sdk'
import type { LendExecutePositionParams } from '@/types/api'
import { getBlockExplorerUrl } from '@/utils/blockExplorer'

interface UseOpenPositionParams {
  openPosition: (
    params: LendExecutePositionParams,
  ) => Promise<LendTransactionReceipt>
  logActivity?: (action: string) => {
    confirm: (data?: { blockExplorerUrl?: string }) => void
    error: () => void
  } | null
}

interface UseClosePositionParams {
  closePosition: (
    params: LendExecutePositionParams,
  ) => Promise<LendTransactionReceipt>
  logActivity?: (action: string) => {
    confirm: (data?: { blockExplorerUrl?: string }) => void
    error: () => void
  } | null
}

export function useOpenPosition({
  openPosition,
  logActivity,
}: UseOpenPositionParams) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: LendExecutePositionParams) => {
      console.log('[useOpenPosition] Starting deposit', {
        marketId: params.marketId,
        amount: params.amount,
        asset: params.asset.metadata.symbol,
      })
      const activity = logActivity?.('deposit')
      try {
        console.log('[useOpenPosition] Calling openPosition')
        const result = await openPosition(params)
        console.log('[useOpenPosition] Deposit successful', { result })

        const blockExplorerUrl = getBlockExplorerUrl(
          params.marketId.chainId,
          result,
        )
        activity?.confirm({ blockExplorerUrl })
        return result
      } catch (error) {
        console.error('[useOpenPosition] Deposit failed', {
          error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          params,
        })
        activity?.error()
        throw error
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
      queryClient.invalidateQueries({
        queryKey: [
          'position',
          variables.marketId.address,
          variables.marketId.chainId,
        ],
      })

      // Delayed refetch in case chain indexing is slow
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
        queryClient.invalidateQueries({
          queryKey: [
            'position',
            variables.marketId.address,
            variables.marketId.chainId,
          ],
        })
      }, 2000)
    },
  })
}

export function useClosePosition({
  closePosition,
  logActivity,
}: UseClosePositionParams) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: LendExecutePositionParams) => {
      const activity = logActivity?.('withdraw')
      try {
        const result = await closePosition(params)

        const blockExplorerUrl = getBlockExplorerUrl(
          params.marketId.chainId,
          result,
        )
        activity?.confirm({ blockExplorerUrl })
        return result
      } catch (error) {
        activity?.error()
        throw error
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
      queryClient.invalidateQueries({
        queryKey: [
          'position',
          variables.marketId.address,
          variables.marketId.chainId,
        ],
      })

      // Delayed refetch in case chain indexing is slow
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
        queryClient.invalidateQueries({
          queryKey: [
            'position',
            variables.marketId.address,
            variables.marketId.chainId,
          ],
        })
      }, 2000)
    },
  })
}
