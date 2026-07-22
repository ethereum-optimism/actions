/**
 * Derives the Borrow form's health readings (current/projected LTV,
 * would-liquidate, health factor) from a settled backend preview, falling back
 * to a local stub-price projection while the preview is in flight.
 */

import { useMemo } from 'react'
import type { Asset, BorrowMarket } from '@eth-optimism/actions-sdk'
import { computeHealthFactor, computeProjection } from '@/utils/borrowMath'

export function useBorrowProjection({
  activeMarket,
  activeAsset,
  amountNum,
  amountUsd,
  mode,
  maxLtv,
  currentBorrUsd,
  currentCollUsd,
  projectionCollateralUsd,
}: {
  activeMarket: BorrowMarket | null
  activeAsset: Asset | null
  amountNum: number
  amountUsd: number
  mode: 'borrow' | 'repay'
  maxLtv: number
  currentBorrUsd: number
  currentCollUsd: number
  projectionCollateralUsd: number
}): {
  currentLtv: number
  projectedLtv: number
  wouldLiquidate: boolean
  projectedHealthFactor: number
} {
  // Local fallback projection while the backend preview is in flight.
  const localProjection = useMemo(() => {
    if (!activeMarket || !activeAsset || amountNum <= 0) return null
    return computeProjection(
      {
        borrowValueUsd: currentBorrUsd,
        collateralValueUsd: projectionCollateralUsd,
      },
      {
        kind: mode === 'borrow' ? 'borrow' : 'repay',
        deltaValueUsd: amountUsd,
      },
      maxLtv,
    )
  }, [
    activeMarket,
    activeAsset,
    amountNum,
    amountUsd,
    currentBorrUsd,
    projectionCollateralUsd,
    mode,
    maxLtv,
  ])

  // Stub-priced demo: use only the local projection (not the SDK quote's oracle-based LTV, which fights the $1770 stub price).
  const currentLtv = currentCollUsd > 0 ? currentBorrUsd / currentCollUsd : 0
  const projectedLtv =
    localProjection && localProjection.kind === 'projected'
      ? localProjection.ltv
      : currentLtv
  const wouldLiquidate = localProjection?.kind === 'wouldLiquidate'
  const projectedHealthFactor =
    localProjection && localProjection.kind === 'projected'
      ? localProjection.healthFactor
      : computeHealthFactor(currentCollUsd, maxLtv, currentBorrUsd)

  return { currentLtv, projectedLtv, wouldLiquidate, projectedHealthFactor }
}
