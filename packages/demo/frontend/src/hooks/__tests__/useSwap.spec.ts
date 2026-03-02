import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useSwap } from '../useSwap'

vi.mock('@/api/actionsApi', () => ({
  actionsApi: {
    getSwapPrice: vi.fn(),
    executeSwap: vi.fn(),
  },
}))

describe('useSwap', () => {
  it('fetches price successfully', async () => {
    const { actionsApi } = await import('@/api/actionsApi')
    const mockPrice = {
      price: '0.005',
      priceInverse: '200',
      amountIn: 100000000n,
      amountOut: 500000000000000000n,
      amountOutFormatted: '0.5',
      priceImpact: 0.001,
    }
    vi.mocked(actionsApi.getSwapPrice).mockResolvedValue(mockPrice as any)

    const { result } = renderHook(() => useSwap())

    expect(result.current.isLoadingPrice).toBe(false)

    let price: any
    await act(async () => {
      price = await result.current.fetchPrice({
        tokenInAddress: '0x1111' as any,
        tokenOutAddress: '0x2222' as any,
        chainId: 84532 as any,
      })
    })

    expect(price).toEqual(mockPrice)
    expect(result.current.priceQuote).toEqual(mockPrice)
  })

  it('handles price fetch error', async () => {
    const { actionsApi } = await import('@/api/actionsApi')
    vi.mocked(actionsApi.getSwapPrice).mockRejectedValue(
      new Error('RPC error'),
    )

    const { result } = renderHook(() => useSwap())

    let price: any
    await act(async () => {
      price = await result.current.fetchPrice({
        tokenInAddress: '0x1111' as any,
        tokenOutAddress: '0x2222' as any,
        chainId: 84532 as any,
      })
    })

    expect(price).toBeNull()
    expect(result.current.error).toBeTruthy()
  })

  it('executes swap successfully', async () => {
    const { actionsApi } = await import('@/api/actionsApi')
    const mockResult = {
      amountIn: 100000000n,
      amountOut: 500000000000000000n,
      price: '0.005',
      priceImpact: 0.001,
    }
    vi.mocked(actionsApi.executeSwap).mockResolvedValue(mockResult as any)

    const { result } = renderHook(() => useSwap())

    let swapResult: any
    await act(async () => {
      swapResult = await result.current.executeSwap({
        amountIn: 100,
        tokenInAddress: '0x1111' as any,
        tokenOutAddress: '0x2222' as any,
        chainId: 84532 as any,
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
          tokenInAddress: '0x1111' as any,
          tokenOutAddress: '0x2222' as any,
          chainId: 84532 as any,
        })
      } catch {
        // Expected to throw
      }
    })

    expect(result.current.error).toBeTruthy()
  })
})
