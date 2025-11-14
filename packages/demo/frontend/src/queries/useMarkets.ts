import { useQuery } from '@tanstack/react-query'
import type { LendMarket } from '@eth-optimism/actions-sdk'

interface UseMarketsParams {
  getMarkets: () => Promise<LendMarket[]>
  isReady: () => boolean
  logActivity?: (action: string) => { confirm: () => void; error: () => void } | null
}

export function useMarkets({ getMarkets, isReady, logActivity }: UseMarketsParams) {
  return useQuery({
    queryKey: ['markets'],
    queryFn: async () => {
      const activity = logActivity?.('getMarket')
      try {
        const result = await getMarkets()
        activity?.confirm()
        return result
      } catch (error) {
        activity?.error()
        throw error
      }
    },
    enabled: isReady(),
    staleTime: 60000, // Markets change rarely - 1 minute
    gcTime: 300000, // 5 minutes
  })
}
