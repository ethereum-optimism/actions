import { describe, expect, it } from 'vitest'
import {
  assertBufferValid,
  computeHealthBarValue,
  computeHealthFactor,
  computeHealthTier,
  computeMaxBorrowSafeUsd,
  computeProjection,
  computeSafeCeilingLtv,
} from './borrowMath'

describe('computeSafeCeilingLtv', () => {
  it('derives safe ceiling = maxLtv * (1 - bufferPct)', () => {
    expect(computeSafeCeilingLtv(0.833, 0.05)).toBeCloseTo(0.79135, 5)
    expect(computeSafeCeilingLtv(0.75, 0.1)).toBeCloseTo(0.675, 5)
  })

  it('returns 0 when bufferPct is 1 (no safe ceiling)', () => {
    expect(computeSafeCeilingLtv(0.833, 1)).toBe(0)
  })
})

describe('computeHealthBarValue', () => {
  it('returns 0 when there is no debt', () => {
    expect(computeHealthBarValue(0, 0.86)).toBe(0)
  })

  it('returns 1 when at the liquidation threshold (LTV == maxLtv)', () => {
    expect(computeHealthBarValue(0.86, 0.86)).toBe(1)
  })

  it('returns 0.5 when half-way to liquidation', () => {
    expect(computeHealthBarValue(0.43, 0.86)).toBeCloseTo(0.5, 5)
  })

  it('clamps to 1 past the liquidation threshold', () => {
    expect(computeHealthBarValue(0.9, 0.86)).toBe(1)
  })

  it('returns 0 when maxLtv is 0 (degenerate)', () => {
    expect(computeHealthBarValue(0.5, 0)).toBe(0)
  })
})

describe('computeHealthTier', () => {
  it('maps thresholds to safe / caution / danger', () => {
    expect(computeHealthTier(0)).toBe('safe')
    expect(computeHealthTier(0.5)).toBe('safe')
    expect(computeHealthTier(0.6)).toBe('caution')
    expect(computeHealthTier(0.79)).toBe('caution')
    expect(computeHealthTier(0.8)).toBe('danger')
    expect(computeHealthTier(1.0)).toBe('danger')
  })
})

describe('computeHealthFactor', () => {
  it('returns Infinity when no debt is open', () => {
    expect(computeHealthFactor(1000, 0.833, 0)).toBe(Infinity)
  })

  it('returns 1.0 when at the liquidation threshold', () => {
    const collateral = 1000
    const maxLtv = 0.833
    const borrow = collateral * maxLtv
    expect(computeHealthFactor(collateral, maxLtv, borrow)).toBeCloseTo(1, 5)
  })

  it('returns > 1 for a safe position', () => {
    // half-borrowed against an 0.833 LLTV: HF = 1000 * 0.833 / 500 = 1.666
    expect(computeHealthFactor(1000, 0.833, 500)).toBeCloseTo(1.666, 3)
  })
})

describe('computeMaxBorrowSafeUsd', () => {
  it('returns collateral * safeCeilingLtv when no current borrow', () => {
    expect(computeMaxBorrowSafeUsd(1000, 0.79135, 0)).toBeCloseTo(791.35, 2)
  })

  it('subtracts current borrow', () => {
    expect(computeMaxBorrowSafeUsd(1000, 0.79135, 200)).toBeCloseTo(591.35, 2)
  })

  it('clamps to 0 when already past the safe ceiling', () => {
    expect(computeMaxBorrowSafeUsd(1000, 0.79135, 900)).toBe(0)
  })
})

describe('computeProjection', () => {
  const current = { borrowValueUsd: 0, collateralValueUsd: 1000 }
  const maxLtv = 0.833

  it('borrow action: bar value rises as user borrows more', () => {
    const small = computeProjection(
      current,
      { kind: 'borrow', deltaValueUsd: 100 },
      maxLtv,
    )
    const large = computeProjection(
      current,
      { kind: 'borrow', deltaValueUsd: 500 },
      maxLtv,
    )
    if (small.kind === 'wouldLiquidate' || large.kind === 'wouldLiquidate') {
      throw new Error('expected projected, not wouldLiquidate')
    }
    expect(small.barValue).toBeLessThan(large.barValue)
    expect(small.tier).toBe('safe')
  })

  it('borrow that lands at liquidation returns wouldLiquidate', () => {
    // collateral=1000, maxLtv=0.833 → liquidation at borrow 833+
    const projection = computeProjection(
      current,
      { kind: 'borrow', deltaValueUsd: 900 },
      maxLtv,
    )
    expect(projection.kind).toBe('wouldLiquidate')
  })

  it('borrow into danger tier (>= 0.8 bar): tier=danger', () => {
    // bar = 0.7/0.833 ≈ 0.84 (danger)
    const projection = computeProjection(
      current,
      { kind: 'borrow', deltaValueUsd: 700 },
      maxLtv,
    )
    if (projection.kind === 'wouldLiquidate') {
      throw new Error('expected projected')
    }
    expect(projection.tier).toBe('danger')
    expect(projection.barValue).toBeGreaterThanOrEqual(0.8)
    expect(projection.barValue).toBeLessThanOrEqual(1)
  })

  it('repay action: bar value falls as user repays', () => {
    const startedWith500 = { borrowValueUsd: 500, collateralValueUsd: 1000 }
    const beforeRepay = computeProjection(
      startedWith500,
      { kind: 'repay', deltaValueUsd: 0 },
      maxLtv,
    )
    const afterRepay = computeProjection(
      startedWith500,
      { kind: 'repay', deltaValueUsd: 200 },
      maxLtv,
    )
    if (
      beforeRepay.kind === 'wouldLiquidate' ||
      afterRepay.kind === 'wouldLiquidate'
    ) {
      throw new Error('expected projected')
    }
    expect(afterRepay.barValue).toBeLessThan(beforeRepay.barValue)
  })

  it('repay full debt leaves HF Infinity', () => {
    const startedWith500 = { borrowValueUsd: 500, collateralValueUsd: 1000 }
    const projection = computeProjection(
      startedWith500,
      { kind: 'repay', deltaValueUsd: 500 },
      maxLtv,
    )
    if (projection.kind === 'wouldLiquidate') {
      throw new Error('expected projected')
    }
    expect(projection.healthFactor).toBe(Infinity)
    expect(projection.barValue).toBe(0)
  })

  it('withdrawCollateral that reduces collateral to zero returns wouldLiquidate', () => {
    const startedWith500 = { borrowValueUsd: 500, collateralValueUsd: 1000 }
    const projection = computeProjection(
      startedWith500,
      { kind: 'withdrawCollateral', deltaValueUsd: 1000 },
      maxLtv,
    )
    expect(projection.kind).toBe('wouldLiquidate')
  })

  it('withdrawCollateral while position is collateralized: bar rises', () => {
    const startedWith500 = { borrowValueUsd: 500, collateralValueUsd: 1000 }
    const before = computeProjection(
      startedWith500,
      { kind: 'withdrawCollateral', deltaValueUsd: 0 },
      maxLtv,
    )
    const after = computeProjection(
      startedWith500,
      { kind: 'withdrawCollateral', deltaValueUsd: 300 },
      maxLtv,
    )
    if (before.kind === 'wouldLiquidate' || after.kind === 'wouldLiquidate') {
      throw new Error('expected projected')
    }
    expect(after.barValue).toBeGreaterThan(before.barValue)
  })
})

describe('assertBufferValid', () => {
  it('accepts valid values in [0, 1)', () => {
    expect(() => assertBufferValid(0)).not.toThrow()
    expect(() => assertBufferValid(0.05)).not.toThrow()
    expect(() => assertBufferValid(0.99)).not.toThrow()
  })

  it('throws for out-of-range values', () => {
    expect(() => assertBufferValid(-0.1)).toThrow()
    expect(() => assertBufferValid(1)).toThrow()
    expect(() => assertBufferValid(1.5)).toThrow()
  })

  it('throws for non-finite values', () => {
    expect(() => assertBufferValid(NaN)).toThrow()
    expect(() => assertBufferValid(Infinity)).toThrow()
  })
})
