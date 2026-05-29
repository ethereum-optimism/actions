/**
 * Derives the Borrow form's health readings (current/projected LTV,
 * would-liquidate, health factor) from a settled backend preview, falling
 * back to a local stub-price projection while the preview is in flight.
 */

import { useMemo } from 'react'
import type {
  Asset,
  BorrowMarket,
  BorrowQuote,
} from '@eth-optimism/actions-sdk'
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
  livePreview,
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
  livePreview: BorrowQuote | null
}): {
  currentLtv: number
  projectedLtv: number
  wouldLiquidate: boolean
  projectedHealthFactor: number
} {
  // Local fallback projection: used while the debounced backend preview is
  // in flight, and for instant feedback as the user types.
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

  const backendLtv = livePreview?.positionAfter.ltv ?? null
  const backendHf = livePreview?.positionAfter.healthFactor ?? null

  // Baseline LTV reflects the user's *current* on-chain position, not the
  // post-projection collateral aggregate, so the "before" reading in the
  // review modal matches reality.
  const currentLtv = currentCollUsd > 0 ? currentBorrUsd / currentCollUsd : 0
  const projectedLtv =
    backendLtv !== null
      ? backendLtv
      : localProjection && localProjection.kind === 'projected'
        ? localProjection.ltv
        : currentLtv
  // Backend doesn't surface a discrete "would liquidate" flag; treat a
  // projected LTV at or above maxLtv as the sentinel.
  const wouldLiquidate =
    backendLtv !== null
      ? backendLtv >= maxLtv
      : localProjection?.kind === 'wouldLiquidate'
  const projectedHealthFactor =
    backendHf !== null
      ? backendHf
      : localProjection && localProjection.kind === 'projected'
        ? localProjection.healthFactor
        : Number.POSITIVE_INFINITY

  return { currentLtv, projectedLtv, wouldLiquidate, projectedHealthFactor }
}
