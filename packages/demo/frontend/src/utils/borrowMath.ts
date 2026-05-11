/**
 * Borrow tab projection math.
 *
 * Pure functions consumed by `<BorrowHealthCard>` and `<BorrowAction>`.
 * USD aggregates stay `number` because they are already lossy display
 * values; on-chain amounts (the source-of-truth) live on
 * `BorrowMarketPosition` as `bigint`.
 *
 * "Bar value" = `currentLtv / safeCeilingLtv`. Bar 100% = at the safe
 * ceiling (NOT at liquidation). Bar > 100% means the position is in the
 * buffer zone, between `safeCeilingLtv` and `maxLtv`.
 *
 * Aave-style `healthFactor` (1.0 = liquidation, Infinity = no debt) is
 * surfaced unchanged from `BorrowMarketPosition.healthFactor` so DeFi-savvy
 * users see the canonical number; the bar's safe-ceiling-as-100% framing
 * is the demo UX innovation, the HF decimal is the industry reference.
 */

export type HealthTier = 'safe' | 'caution' | 'danger' | 'buffer'

export const computeSafeCeilingLtv = (
  maxLtv: number,
  bufferPct: number,
): number => maxLtv * (1 - bufferPct)

export const computeHealthBarValue = (
  currentLtv: number,
  safeCeilingLtv: number,
): number => {
  if (safeCeilingLtv <= 0) return 0
  return currentLtv / safeCeilingLtv
}

export const computeHealthTier = (barValue: number): HealthTier => {
  if (barValue > 1) return 'buffer'
  if (barValue >= 0.8) return 'danger'
  if (barValue >= 0.6) return 'caution'
  return 'safe'
}

/**
 * Aave-style health factor.
 *
 *   HF = (collateralValueUsd * maxLtv) / borrowValueUsd
 *
 * Returns Infinity when no debt is open (collateral-only state). This
 * matches PR #3's `BorrowMarketPosition.healthFactor` semantics so the
 * demo and SDK agree on the number's meaning.
 */
export const computeHealthFactor = (
  collateralValueUsd: number,
  maxLtv: number,
  borrowValueUsd: number,
): number => {
  if (borrowValueUsd <= 0) return Infinity
  return (collateralValueUsd * maxLtv) / borrowValueUsd
}

// ---------- Projection (what would happen if user acted) ----------

export type Projection =
  | {
      kind: 'projected'
      ltv: number
      barValue: number
      tier: HealthTier
      /** Canonical Aave-style HF surfaced as the review-modal secondary label. */
      healthFactor: number
    }
  | { kind: 'wouldLiquidate' }

export type ProjectionAction =
  | { kind: 'borrow'; deltaValueUsd: number }
  | { kind: 'repay'; deltaValueUsd: number }
  | { kind: 'withdrawCollateral'; deltaValueUsd: number }

export const computeProjection = (
  current: { borrowValueUsd: number; collateralValueUsd: number },
  action: ProjectionAction,
  maxLtv: number,
  safeCeilingLtv: number,
): Projection => {
  let nextBorrow = current.borrowValueUsd
  let nextCollateral = current.collateralValueUsd

  switch (action.kind) {
    case 'borrow':
      nextBorrow = current.borrowValueUsd + action.deltaValueUsd
      break
    case 'repay':
      nextBorrow = Math.max(0, current.borrowValueUsd - action.deltaValueUsd)
      break
    case 'withdrawCollateral':
      nextCollateral = current.collateralValueUsd - action.deltaValueUsd
      if (nextCollateral <= 0) {
        return { kind: 'wouldLiquidate' }
      }
      break
  }

  const ltv = nextCollateral > 0 ? nextBorrow / nextCollateral : 0
  const barValue = computeHealthBarValue(ltv, safeCeilingLtv)
  return {
    kind: 'projected',
    ltv,
    barValue,
    tier: computeHealthTier(barValue),
    healthFactor: computeHealthFactor(nextCollateral, maxLtv, nextBorrow),
  }
}

// ---------- Max button helper ----------

/**
 * Returns the USD amount of additional borrow that would land the
 * position at exactly the safe ceiling (bar = 100%). Clamps to zero if
 * the user is already past the ceiling.
 */
export const computeMaxBorrowSafeUsd = (
  collateralValueUsd: number,
  safeCeilingLtv: number,
  currentBorrowValueUsd: number,
): number =>
  Math.max(0, collateralValueUsd * safeCeilingLtv - currentBorrowValueUsd)

// ---------- Invariant guard ----------

export const assertBufferValid = (bufferPct: number): void => {
  if (!Number.isFinite(bufferPct) || bufferPct < 0 || bufferPct >= 1) {
    throw new Error(
      `BORROW_HEALTH_BUFFER_PCT must be a finite number in [0, 1); got ${bufferPct}`,
    )
  }
}
