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
      console.log('[useMintAsset] Mutation started', {
        asset: asset.metadata.symbol,
      })
      const activity = logActivity?.('mint')
      try {
        console.log('[useMintAsset] Calling mintAsset function')
        const result = await mintAsset(asset)
        console.log('[useMintAsset] Mint result', { result })

        // Extract block explorer URL from the result if available
        const blockExplorerUrl =
          result && 'blockExplorerUrls' in result && result.blockExplorerUrls
            ? result.blockExplorerUrls[0]
            : undefined

        console.log('[useMintAsset] Block explorer URL', { blockExplorerUrl })
        activity?.confirm({ blockExplorerUrl })
      } catch (error) {
        console.error('[useMintAsset] Error minting asset', { error })
        activity?.error()
        throw error
      }
    },
    onSuccess: () => {
      console.log('[useMintAsset] Mutation successful, invalidating queries')
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
