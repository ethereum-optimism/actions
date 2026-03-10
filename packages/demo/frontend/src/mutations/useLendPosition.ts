import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { LendTransactionReceipt } from '@eth-optimism/actions-sdk'
import type { LendExecutePositionParams } from '@/types/api'
import { getBlockExplorerUrl } from '@/utils/blockExplorer'

interface LendMutationParams extends LendExecutePositionParams {
  marketName?: string
}

interface UseOpenPositionParams {
  openPosition: (
    params: LendExecutePositionParams,
  ) => Promise<LendTransactionReceipt>
  logActivity?: (
    action: string,
    metadata?: import('@/providers/ActivityLogProvider').ActivityMetadata,
  ) => {
    confirm: (data?: {
      blockExplorerUrl?: string
      metadata?: import('@/providers/ActivityLogProvider').ActivityMetadata
    }) => void
    error: () => void
  } | null
}

interface UseClosePositionParams {
  closePosition: (
    params: LendExecutePositionParams,
  ) => Promise<LendTransactionReceipt>
  logActivity?: (
    action: string,
    metadata?: import('@/providers/ActivityLogProvider').ActivityMetadata,
  ) => {
    confirm: (data?: {
      blockExplorerUrl?: string
      metadata?: import('@/providers/ActivityLogProvider').ActivityMetadata
    }) => void
    error: () => void
  } | null
}

export function useOpenPosition({
  openPosition,
  logActivity,
}: UseOpenPositionParams) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: LendMutationParams) => {
      const activity = logActivity?.('deposit', {
        amount: params.amount.toString(),
        assetSymbol: params.asset.metadata.symbol,
        marketName: params.marketName,
        chainId: params.marketId.chainId,
      })
      try {
        const result = await openPosition(params)

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

      // Retry in case RPC returns stale state right after the transaction
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
    mutationFn: async (params: LendMutationParams) => {
      const activity = logActivity?.('withdraw', {
        amount: params.amount.toString(),
        assetSymbol: params.asset.metadata.symbol,
        marketName: params.marketName,
        chainId: params.marketId.chainId,
      })
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

      // Retry in case RPC returns stale state right after the transaction
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
