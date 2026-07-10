import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import {
  buildLendPosition,
  createMockLendOperations,
  EMPTY_LEND_MARKET,
  FUNDED_LEND_MARKET,
  makeLendHookWrapper,
} from '@/test-utils/lendFixtures'
import { useLendProvider } from '../useLendProvider'

describe('useLendProvider getPositions join', () => {
  it('keeps only funded markets and matches addresses case-insensitively', async () => {
    const operations = createMockLendOperations([
      buildLendPosition(
        FUNDED_LEND_MARKET.toLowerCase() as Address,
        10_000_000n,
      ),
      buildLendPosition(EMPTY_LEND_MARKET, 0n),
    ])

    const { result } = renderHook(
      () => useLendProvider({ operations, ready: true }),
      { wrapper: makeLendHookWrapper() },
    )

    await waitFor(() => {
      expect(result.current.selectedMarket).not.toBeNull()
    })
    await waitFor(() => {
      expect(operations.getPositions).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(result.current.marketPositions).toHaveLength(1)
    })
    const funded = result.current.marketPositions[0]
    expect(funded.marketName).toBe('Morpho')
    expect(funded.marketId.address).toBe(FUNDED_LEND_MARKET)
    expect(funded.depositedAmount).toBe('10000000')
    expect(funded.depositedSharesRaw).toBe(10_000_000n)
  })

  it('returns no positions when every market is zero-balance', async () => {
    const operations = createMockLendOperations([
      buildLendPosition(FUNDED_LEND_MARKET, 0n),
      buildLendPosition(EMPTY_LEND_MARKET, 0n),
    ])

    const { result } = renderHook(
      () => useLendProvider({ operations, ready: true }),
      { wrapper: makeLendHookWrapper() },
    )

    await waitFor(() => {
      expect(operations.getPositions).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(result.current.selectedMarket).not.toBeNull()
    })
    expect(result.current.marketPositions).toHaveLength(0)
  })
})
