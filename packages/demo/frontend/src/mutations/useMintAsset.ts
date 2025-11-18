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
    onSuccess: async () => {
      console.log('[useMintAsset] Mutation successful, invalidating queries')
      // Invalidate token balances to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })

      // Wait for chain to process, then refetch again
      setTimeout(() => {
        console.log('[useMintAsset] Refetching balances after delay')
        queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
      }, 3000)
    },
    onError: (error) => {
      console.error('[useMintAsset] Mutation failed', { error })
    },
  })
}
