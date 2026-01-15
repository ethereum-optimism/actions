import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Asset } from '@eth-optimism/actions-sdk'

interface UseMintAssetParams {
  mintAsset: (asset: Asset) => Promise<{ blockExplorerUrls?: string[] } | void>
  logActivity?: (action: string) => {
    confirm: (data?: { blockExplorerUrl?: string }) => void
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

      // Delayed refetch in case chain indexing is slow
      // Won't show loading because mutation state is reset after first refetch
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
      }, 2000)
    },
    onError: (error) => {
      console.error('[useMintAsset] Mutation failed', { error })
    },
  })
}
