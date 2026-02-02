import { useState, useCallback } from 'react'
import type { SupportedChainId } from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'

import { actionsApi } from '@/api/actionsApi'

export interface UseSwapPriceParams {
  tokenInAddress: Address
  tokenOutAddress: Address
  chainId: SupportedChainId
  amountIn?: number
}

export interface UseSwapExecuteParams {
  amountIn: number
  tokenInAddress: Address
  tokenOutAddress: Address
  chainId: SupportedChainId
  slippage?: number
}

export interface SwapExecuteResult {
  amountIn: bigint
  amountOut: bigint
  price: string
  priceImpact: number
  blockExplorerUrls?: string[]
}

export interface SwapPriceResult {
  price: string
  priceInverse: string
  amountIn: bigint
  amountOut: bigint
  amountOutFormatted: string
  priceImpact: number
  gasEstimate?: bigint
}

export function useSwap(authHeaders: HeadersInit = {}) {
  const [priceQuote, setPriceQuote] = useState<SwapPriceResult | null>(null)
  const [isLoadingPrice, setIsLoadingPrice] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchPrice = useCallback(
    async (params: UseSwapPriceParams): Promise<SwapPriceResult | null> => {
      setIsLoadingPrice(true)
      setError(null)

      try {
        const price = await actionsApi.getSwapPrice(params, authHeaders)
        setPriceQuote(price)
        return price
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to fetch price')
        setError(error)
        return null
      } finally {
        setIsLoadingPrice(false)
      }
    },
    [authHeaders],
  )

  const executeSwap = useCallback(
    async (params: UseSwapExecuteParams): Promise<SwapExecuteResult> => {
      setIsExecuting(true)
      setError(null)

      try {
        const result = await actionsApi.executeSwap(params, authHeaders)
        return result
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to execute swap')
        setError(error)
        throw error
      } finally {
        setIsExecuting(false)
      }
    },
    [authHeaders],
  )

  const clearPrice = useCallback(() => {
    setPriceQuote(null)
  }, [])

  return {
    priceQuote,
    isLoadingPrice,
    isExecuting,
    error,
    fetchPrice,
    executeSwap,
    clearPrice,
  }
}
