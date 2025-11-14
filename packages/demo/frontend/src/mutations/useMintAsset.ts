import { useMutation, useQueryClient } from '@tanstack/react-query'

interface UseMintAssetParams {
  mintAsset: (assetSymbol: string, chainId: number) => Promise<void>
  logActivity?: (action: string) => { confirm: () => void; error: () => void } | null
}

export function useMintAsset({ mintAsset, logActivity }: UseMintAssetParams) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ assetSymbol, chainId }: { assetSymbol: string; chainId: number }) => {
      const activity = logActivity?.('mint')
      try {
        await mintAsset(assetSymbol, chainId)
        activity?.confirm()
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
