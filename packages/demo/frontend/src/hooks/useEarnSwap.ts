import { useCallback, useEffect } from 'react'
import type { Asset, SupportedChainId } from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'

import { actionsApi } from '@/api/actionsApi'
import { useSwap } from '@/hooks/useSwap'
import { useSwapAssets } from '@/hooks/useSwapAssets'
import { useTotalBalance } from '@/hooks/useTotalBalance'
import { OP_DEMO, USDC_DEMO } from '@/constants/markets'
import type { LendProviderOperations } from '@/hooks/useLendProvider'

interface UseEarnSwapParams {
  getAuthHeaders: () => Promise<{ Authorization: string } | undefined>
  actions?: { getSupportedAssets: () => Asset[] }
  operations: LendProviderOperations
  activeTab: string
  assetBalance: string | undefined
}

export function useEarnSwap({
  getAuthHeaders,
  actions,
  operations,
  activeTab,
  assetBalance,
}: UseEarnSwapParams) {
  const { isExecuting: isSwapping } = useSwap()

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
      try {
        const headers = await getAuthHeaders()
        const price = await actionsApi.getSwapPrice(
          { tokenInAddress, tokenOutAddress, chainId, amountIn, amountOut },
          headers,
        )
        return {
          price: price.price,
          priceImpact: price.priceImpact,
          amountInFormatted: price.amountInFormatted,
          amountOutFormatted: price.amountOutFormatted,
        }
      } catch {
        return null
      }
    },
    [getAuthHeaders],
  )

  const getTokenBalances = useCallback(async () => {
    return operations.getTokenBalances()
  }, [operations])

  const {
    assets: swapAssets,
    isLoading: isLoadingSwapAssets,
    refetch: refetchSwapAssets,
  } = useSwapAssets({
    actions,
    getAuthHeaders,
    getTokenBalances,
    enabled: true,
    marketAllowlist: [USDC_DEMO, OP_DEMO],
  })

  // Refetch swap assets when switching to swap tab or when balances change
  useEffect(() => {
    if (activeTab === 'swap') {
      refetchSwapAssets()
    }
  }, [activeTab, refetchSwapAssets])

  useEffect(() => {
    refetchSwapAssets()
  }, [assetBalance, refetchSwapAssets])

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
      const result = await operations.executeSwap({
        amountIn,
        assetIn,
        assetOut,
        chainId,
      })
      refetchSwapAssets()
      setTimeout(() => refetchSwapAssets(), 2000)
      return result
    },
    [operations, refetchSwapAssets],
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
