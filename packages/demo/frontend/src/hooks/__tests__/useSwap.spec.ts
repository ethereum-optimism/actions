import { renderHook, act } from '@testing-library/react'
import type {
  SupportedChainId,
  SwapPrice,
} from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { useSwap } from '../useSwap'
import type { SwapPriceResult, SwapExecuteResult } from '../useSwap'

vi.mock('@/api/actionsApi', () => ({
  actionsApi: {
    getSwapPrice: vi.fn(),
    executeSwap: vi.fn(),
  },
}))

const TOKEN_IN = '0x1111111111111111111111111111111111111111' as Address
const TOKEN_OUT = '0x2222222222222222222222222222222222222222' as Address
const CHAIN_ID = 84532 as SupportedChainId

describe('useSwap', () => {
  it('fetches price successfully', async () => {
    const { actionsApi } = await import('@/api/actionsApi')
    const mockPrice: SwapPrice = {
      price: '0.005',
      priceInverse: '200',
      amountIn: 100000000n,
      amountOut: 500000000000000000n,
      amountInFormatted: '100',
      amountOutFormatted: '0.5',
      priceImpact: 0.001,
      route: { path: [], pools: [] },
    }
    vi.mocked(actionsApi.getSwapPrice).mockResolvedValue(mockPrice)

    const { result } = renderHook(() => useSwap())

    expect(result.current.isLoadingPrice).toBe(false)

    let price: SwapPriceResult | null = null
    await act(async () => {
      price = await result.current.fetchPrice({
        tokenInAddress: TOKEN_IN,
        tokenOutAddress: TOKEN_OUT,
        chainId: CHAIN_ID,
      })
    })

    expect(price).toEqual(mockPrice)
    expect(result.current.priceQuote).toEqual(mockPrice)
  })

  it('handles price fetch error', async () => {
    const { actionsApi } = await import('@/api/actionsApi')
    vi.mocked(actionsApi.getSwapPrice).mockRejectedValue(new Error('RPC error'))

    const { result } = renderHook(() => useSwap())

    let price: SwapPriceResult | null = null
    await act(async () => {
      price = await result.current.fetchPrice({
        tokenInAddress: TOKEN_IN,
        tokenOutAddress: TOKEN_OUT,
        chainId: CHAIN_ID,
      })
    })

    expect(price).toBeNull()
    expect(result.current.error).toBeTruthy()
  })

  it('executes swap successfully', async () => {
    const { actionsApi } = await import('@/api/actionsApi')
    const mockResult: SwapExecuteResult = {
      amountIn: 100000000n,
      amountOut: 500000000000000000n,
      price: '0.005',
      priceImpact: 0.001,
    }
    vi.mocked(actionsApi.executeSwap).mockResolvedValue(mockResult)

    const { result } = renderHook(() => useSwap())

    let swapResult: SwapExecuteResult | undefined
    await act(async () => {
      swapResult = await result.current.executeSwap({
        amountIn: 100,
        tokenInAddress: TOKEN_IN,
        tokenOutAddress: TOKEN_OUT,
        chainId: CHAIN_ID,
      })
    })

    expect(swapResult).toEqual(mockResult)
    expect(result.current.isExecuting).toBe(false)
  })

  it('handles swap execution error', async () => {
    const { actionsApi } = await import('@/api/actionsApi')
    vi.mocked(actionsApi.executeSwap).mockRejectedValue(
      new Error('Swap failed'),
    )

    const { result } = renderHook(() => useSwap())

    await act(async () => {
      try {
        await result.current.executeSwap({
          amountIn: 100,
          tokenInAddress: TOKEN_IN,
          tokenOutAddress: TOKEN_OUT,
          chainId: CHAIN_ID,
        })
      } catch {
        // Expected to throw
      }
    })

    expect(result.current.error).toBeTruthy()
  })
})
