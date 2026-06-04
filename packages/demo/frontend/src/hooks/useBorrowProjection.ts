/**
 * Derives the Borrow form's health readings (current/projected LTV,
 * would-liquidate, health factor) from a settled backend preview, falling back
 * to a local stub-price projection while the preview is in flight.
 */

import { useMemo } from 'react'
import type { Asset, BorrowMarket } from '@eth-optimism/actions-sdk'
import { computeProjection } from '@/utils/borrowMath'

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

  // The whole demo is stub-priced, so health is computed from one source — the
  // local stub projection — for both current and projected. The SDK quote's
  // ltv/HF use each protocol's real on-chain oracle, which would fight the stub
  // display (e.g. Aave's ETH oracle vs the $1770 stub) and make borrowing move
  // the bar the wrong way.
  const currentLtv = currentCollUsd > 0 ? currentBorrUsd / currentCollUsd : 0
  const projectedLtv =
    localProjection && localProjection.kind === 'projected'
      ? localProjection.ltv
      : currentLtv
  const wouldLiquidate = localProjection?.kind === 'wouldLiquidate'
  const projectedHealthFactor =
    localProjection && localProjection.kind === 'projected'
      ? localProjection.healthFactor
      : Number.POSITIVE_INFINITY

  return { currentLtv, projectedLtv, wouldLiquidate, projectedHealthFactor }
}
