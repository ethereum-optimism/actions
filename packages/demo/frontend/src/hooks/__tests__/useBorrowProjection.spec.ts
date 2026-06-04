import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Asset, BorrowMarket } from '@eth-optimism/actions-sdk'

import { useBorrowProjection } from '../useBorrowProjection'

const market = {
  marketId: {
    kind: 'aave-v3',
    marketId: '0x' + 'c'.repeat(64),
    chainId: 11155420,
  },
} as unknown as BorrowMarket
const asset = { metadata: { symbol: 'USDC', decimals: 6 } } as Asset

// $35.40 collateral (0.02 ETH @ $1770), $14 debt → current LTV ~39.5%.
const base = {
  activeMarket: market,
  activeAsset: asset,
  mode: 'borrow' as const,
  maxLtv: 0.78,
  currentBorrUsd: 14,
  currentCollUsd: 35.4,
  projectionCollateralUsd: 35.4,
}

describe('useBorrowProjection (stub-priced)', () => {
  it('borrowing more raises the projected LTV above the current LTV', () => {
    const { result } = renderHook(() =>
      useBorrowProjection({ ...base, amountNum: 5, amountUsd: 5 }),
    )
    expect(result.current.projectedLtv).toBeGreaterThan(
      result.current.currentLtv,
    )
  })

  it('repaying lowers the projected LTV below the current LTV', () => {
    const { result } = renderHook(() =>
      useBorrowProjection({
        ...base,
        mode: 'repay',
        amountNum: 5,
        amountUsd: 5,
      }),
    )
    expect(result.current.projectedLtv).toBeLessThan(result.current.currentLtv)
  })

  it('falls back to the current LTV when no amount is entered', () => {
    const { result } = renderHook(() =>
      useBorrowProjection({ ...base, amountNum: 0, amountUsd: 0 }),
    )
    expect(result.current.projectedLtv).toBe(result.current.currentLtv)
  })
})
