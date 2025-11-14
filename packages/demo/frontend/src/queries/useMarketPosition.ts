import { useQuery } from '@tanstack/react-query'
import type { LendMarketId, LendMarketPosition } from '@eth-optimism/actions-sdk'

interface UseMarketPositionParams {
  marketId?: LendMarketId | null
  getPosition: (marketId: LendMarketId) => Promise<LendMarketPosition>
  isReady: () => boolean
  logActivity?: (action: string) => { confirm: () => void; error: () => void } | null
}

export function useMarketPosition({
  marketId,
  getPosition,
  isReady,
  logActivity,
}: UseMarketPositionParams) {
  return useQuery({
    queryKey: ['position', marketId?.address, marketId?.chainId],
    queryFn: async () => {
      if (!marketId) return null

      const activity = logActivity?.('getPosition')
      try {
        const result = await getPosition(marketId)
        activity?.confirm()
        return result
      } catch (error) {
        activity?.error()
        throw error
      }
    },
    enabled: isReady() && !!marketId,
    staleTime: 10000, // 10 seconds
    gcTime: 60000, // 1 minute
  })
}
