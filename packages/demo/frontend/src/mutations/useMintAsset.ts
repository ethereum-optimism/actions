import { useMutation, useQueryClient } from '@tanstack/react-query'

interface UseMintAssetParams {
  mintAsset: (
    assetSymbol: string,
    chainId: number,
  ) => Promise<{ blockExplorerUrls?: string[] } | void>
  logActivity?: (action: string) => {
    confirm: (data?: { blockExplorerUrl?: string }) => void
    error: () => void
  } | null
}

export function useMintAsset({ mintAsset, logActivity }: UseMintAssetParams) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      assetSymbol,
      chainId,
    }: {
      assetSymbol: string
      chainId: number
    }) => {
      const activity = logActivity?.('mint')
      try {
        const result = await mintAsset(assetSymbol, chainId)

        // Extract block explorer URL from the result if available
        const blockExplorerUrl =
          result && 'blockExplorerUrls' in result && result.blockExplorerUrls
            ? result.blockExplorerUrls[0]
            : undefined

        activity?.confirm({ blockExplorerUrl })
      } catch (error) {
        activity?.error()
        throw error
      }
    },
    onSuccess: () => {
      // Invalidate token balances to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
    },
  })
}
