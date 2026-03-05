import { useCallback, useEffect, useState } from 'react'
import { useQueryClient, useQuery, skipToken } from '@tanstack/react-query'
import type {
  Asset,
  SupportedChainId,
  TokenBalance,
} from '@eth-optimism/actions-sdk/react'

import { useSwapAssets } from '@/hooks/useSwapAssets'
import { useTotalBalance } from '@/hooks/useTotalBalance'
import { useActivityLogger } from '@/hooks/useActivityLogger'
import { OP_DEMO, USDC_DEMO } from '@/constants/markets'
import type { LendProviderOperations } from '@/hooks/useLendProvider'

interface UseEarnSwapParams {
  operations: LendProviderOperations
  activeTab: string
}

export function useEarnSwap({ operations, activeTab }: UseEarnSwapParams) {
  const [isSwapping, setIsSwapping] = useState(false)
  const queryClient = useQueryClient()
  const { logActivity } = useActivityLogger()

  // Passive subscriber — reads balances from cache populated by the lend path
  const { data: walletTokenBalances } = useQuery<TokenBalance[]>({
    queryKey: ['tokenBalances'],
    queryFn: skipToken,
  })

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
      })
    },
    [operations],
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

  // Refetch swap assets when switching to swap tab or when balances change
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
        })
        const activity = logActivity('getBalance')
        await queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
        activity?.confirm()
        refetchSwapAssets()
        return result
      } finally {
        setIsSwapping(false)
      }
    },
    [isSwapping, operations, logActivity, queryClient, refetchSwapAssets],
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
    isLoadingTotalBalance,
  }
}
