import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Asset } from '@eth-optimism/actions-sdk'

interface UseMintAssetParams {
  mintAsset: (asset: Asset) => Promise<{ blockExplorerUrls?: string[] } | void>
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

export function useMintAsset({ mintAsset, logActivity }: UseMintAssetParams) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ asset }: { asset: Asset }) => {
      const activity = logActivity?.('mint')
      try {
        const result = await mintAsset(asset)

        // Extract block explorer URL from the result if available
        const blockExplorerUrl =
          result && 'blockExplorerUrls' in result && result.blockExplorerUrls
            ? result.blockExplorerUrls[0]
            : undefined

        activity?.confirm({ blockExplorerUrl })
      } catch (error) {
        console.error('[useMintAsset] Error minting asset', { error })
        activity?.error()
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
    },
    onError: (error) => {
      console.error('[useMintAsset] Mutation failed', { error })
    },
  })
}
