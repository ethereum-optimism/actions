import { useQuery } from '@tanstack/react-query'
import type { TokenBalance } from '@eth-optimism/actions-sdk/react'

interface UseTokenBalancesParams {
  getTokenBalances: () => Promise<TokenBalance[]>
  isReady: () => boolean
  logActivity?: (action: string) => { confirm: () => void; error: () => void } | null
}

export function useTokenBalances({
  getTokenBalances,
  isReady,
  logActivity,
}: UseTokenBalancesParams) {
  return useQuery({
    queryKey: ['tokenBalances'],
    queryFn: async () => {
      const activity = logActivity?.('getBalance')
      try {
        const result = await getTokenBalances()
        activity?.confirm()
        return result
      } catch (error) {
        activity?.error()
        throw error
      }
    },
    enabled: isReady(),
    staleTime: 30000, // Consider fresh for 30s
    gcTime: 300000, // Keep in cache for 5min
  })
}
