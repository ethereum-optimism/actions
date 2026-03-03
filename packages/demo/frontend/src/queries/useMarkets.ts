import { useQuery } from '@tanstack/react-query'
import type { LendMarket } from '@eth-optimism/actions-sdk'

interface UseMarketsParams {
  getMarkets: () => Promise<LendMarket[]>
  isReady: () => boolean
}

export function useMarkets({
  getMarkets,
  isReady,
}: UseMarketsParams) {
  return useQuery({
    queryKey: ['markets'],
    queryFn: () => getMarkets(),
    enabled: isReady(),
    staleTime: 60000, // Markets change rarely - 1 minute
    gcTime: 300000, // 5 minutes
  })
}
