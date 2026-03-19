import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Asset, SupportedChainId, SwapMarket } from '@eth-optimism/actions-sdk/react'

import type { TokenBalance } from '@eth-optimism/actions-sdk/react'
import { useSwapAssets } from '@/hooks/useSwapAssets'
import { useTotalBalance } from '@/hooks/useTotalBalance'
import { useActivityLogger } from '@/hooks/useActivityLogger'
import { OP_DEMO, USDC_DEMO } from '@/constants/markets'
import type { EarnOperations } from '@/hooks/useLendProvider'

interface UseSwapParams {
  operations: EarnOperations
  activeTab: string
}

export function useSwap({ operations, activeTab }: UseSwapParams) {
  const [isSwapping, setIsSwapping] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { logActivity } = useActivityLogger()

  // Read-only subscriber to tokenBalances cache (managed by lend path's useTokenBalances).
  // enabled:false means this never triggers fetches — it only receives cache updates.
  // queryFn provided to suppress React Query warning (never called when disabled).
  const { data: walletTokenBalances } = useQuery<TokenBalance[]>({
    queryKey: ['tokenBalances'],
    queryFn: () => Promise.resolve([]),
    enabled: false,
  })
  const isLoadingBalances = !walletTokenBalances

  // Fetch swap markets to populate the provider selector
  const { data: swapMarkets = [], isLoading: isLoadingMarkets } = useQuery<
    SwapMarket[]
  >({
    queryKey: ['swapMarkets'],
    queryFn: () => operations.getSwapMarkets(),
    enabled: activeTab === 'swap',
  })

  // Auto-select first provider when markets load
  useEffect(() => {
    if (swapMarkets.length > 0 && !selectedProvider) {
      setSelectedProvider(swapMarkets[0].provider)
    }
  }, [swapMarkets, selectedProvider])

  const handleGetPrice = useCallback(
    async ({
      tokenInAddress,
      tokenOutAddress,
      chainId,
      amountIn,
      amountOut,
    }: {
      tokenInAddress: Address
      tokenOutAddress: Address
      chainId: SupportedChainId
      amountIn?: number
      amountOut?: number
    }) => {
      return operations.getSwapPrice({
        tokenInAddress,
        tokenOutAddress,
        chainId,
        amountIn,
        amountOut,
        provider: selectedProvider ?? undefined,
      })
    },
    [operations, selectedProvider],
  )

  const {
    assets: swapAssets,
    isLoading: isLoadingSwapAssets,
    refetch: refetchSwapAssets,
  } = useSwapAssets({
    getConfiguredAssets: operations.getConfiguredAssets,
    tokenBalances: walletTokenBalances,
    enabled: true,
    marketAllowlist: [USDC_DEMO, OP_DEMO],
  })

  // Fetch configured assets when switching to swap tab
  useEffect(() => {
    if (activeTab === 'swap') {
      refetchSwapAssets()
    }
  }, [activeTab, refetchSwapAssets])

  const handleSwap = useCallback(
    async ({
      amountIn,
      assetIn,
      assetOut,
      chainId,
    }: {
      amountIn: number
      assetIn: Asset
      assetOut: Asset
      chainId: SupportedChainId
    }) => {
      if (isSwapping) return
      setIsSwapping(true)
      try {
        const result = await operations.executeSwap({
          amountIn,
          assetIn,
          assetOut,
          chainId,
          provider: selectedProvider ?? undefined,
        })
        const activity = logActivity('getBalance')
        await queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
        activity?.confirm()
        // Retry shortly after in case RPC returned stale balance
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
        }, 1000)
        return result
      } finally {
        setIsSwapping(false)
      }
    },
    [isSwapping, operations, selectedProvider, logActivity, queryClient],
  )

  const {
    tokenBalances,
    totalUsd,
    isLoading: isLoadingTotalBalance,
  } = useTotalBalance({
    assets: swapAssets,
    getPrice: handleGetPrice,
  })

  return {
    swapAssets,
    isLoadingSwapAssets,
    isSwapping,
    handleSwap,
    handleGetPrice,
    tokenBalances,
    totalUsd,
    isLoadingTotalBalance: isLoadingTotalBalance || isLoadingBalances,
    swapMarkets,
    isLoadingMarkets,
    selectedProvider,
    setSelectedProvider,
  }
}
