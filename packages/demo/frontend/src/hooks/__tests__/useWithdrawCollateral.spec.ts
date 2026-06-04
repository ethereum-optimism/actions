import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  buildBorrowMarketPosition,
  usdcAsset,
} from '@/test-utils/borrowFixtures'
import type { BorrowPosition } from '@/types/market'

// $100 collateral (USDC @ $1), $4 debt (40 OP @ $0.1) → current LTV 4%.
const pledged: BorrowPosition = buildBorrowMarketPosition({
  collateralAsset: usdcAsset,
  collateralAmount: 100_000_000n,
  collateralShares: 100_000_000n,
  collateralAmountFormatted: '100',
  borrowAmount: 40n,
  borrowAmountFormatted: '40',
  maxLtv: 0.86,
})

vi.mock('@/hooks/useCollateralStatus', () => ({
  useCollateralStatus: () => ({ positions: [pledged], isPledged: true }),
}))

import { useWithdrawCollateral } from '../useWithdrawCollateral'

function render(amountValue: number) {
  return renderHook(() =>
    useWithdrawCollateral({
      asset: usdcAsset,
      mode: 'withdraw',
      amount: String(amountValue),
      amountValue,
      maxAmount: '100',
      // Fully pledged: nothing sits unpledged in the vault.
      directDepositedAmount: '0',
    }),
  )
}

describe('useWithdrawCollateral (fully-pledged collateral)', () => {
  it('computes a collateral release when all collateral is pledged', () => {
    const { result } = render(50)
    expect(result.current.releaseCollateralAmountRaw).not.toBeNull()
    expect(result.current.releaseCollateralAmountRaw!).toBeGreaterThan(0n)
    expect(result.current.showHealthCard).toBe(true)
    expect(result.current.withdrawWouldLiquidate).toBe(false)
  })

  it('gates a withdraw that would liquidate the secured borrow', () => {
    const { result } = render(99)
    expect(result.current.withdrawWouldLiquidate).toBe(true)
  })
})
