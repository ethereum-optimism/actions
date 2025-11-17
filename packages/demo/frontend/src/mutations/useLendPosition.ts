import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { LendTransactionReceipt } from '@eth-optimism/actions-sdk'
import type { LendExecutePositionParams } from '@/types/api'

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
      const activity = logActivity?.('deposit')
      try {
        const result = await openPosition(params)

        // Extract block explorer URL from the result
        const blockExplorerUrl =
          'blockExplorerUrls' in result &&
          Array.isArray(result.blockExplorerUrls)
            ? result.blockExplorerUrls[0]
            : undefined

        activity?.confirm({ blockExplorerUrl })
        return result
      } catch (error) {
        activity?.error()
        throw error
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate both balances and position for the affected market
      queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
      queryClient.invalidateQueries({
        queryKey: [
          'position',
          variables.marketId.address,
          variables.marketId.chainId,
        ],
      })
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

        // Extract block explorer URL from the result
        const blockExplorerUrl =
          'blockExplorerUrls' in result &&
          Array.isArray(result.blockExplorerUrls)
            ? result.blockExplorerUrls[0]
            : undefined

        activity?.confirm({ blockExplorerUrl })
        return result
      } catch (error) {
        activity?.error()
        throw error
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate both balances and position for the affected market
      queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
      queryClient.invalidateQueries({
        queryKey: [
          'position',
          variables.marketId.address,
          variables.marketId.chainId,
        ],
      })
    },
  })
}
