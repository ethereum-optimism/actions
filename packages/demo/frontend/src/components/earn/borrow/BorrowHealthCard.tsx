/**
 * Borrow Health card: the two-tone health bar, a tooltip, and the
 * Liquidation / Borrow APY / Buffer / Collateral rows. Bar fill is
 * `currentLtv / maxLtv` clamped to 1 (100% = liquidation LTV) while the numeric
 * reading shows the raw LTV %. Used in Borrow, Repay, and Lend-tab withdraw.
 */

import { memo } from 'react'
import {
  computeHealthBarValue,
  computeHealthTier,
  type HealthTier,
} from '@/utils/borrowMath'
import { InfoTooltip } from '../InfoTooltip'
import { BorrowHealthBar } from './BorrowHealthBar'
import { BorrowHealthStats } from './BorrowHealthStats'
import type { Asset } from '@eth-optimism/actions-sdk'

export interface BorrowHealthCardProps {
  currentLtv: number
  projectedLtv: number
  /** LLTV (liquidation threshold); bar max = 1 maps to this LTV. */
  maxLtv: number
  bufferPct: number
  borrowApy: number
  collateralAsset: Asset
  collateralValueUsd: number
  /** Aave-style HF surfaced as a small secondary numeric (PR #3 contract). */
  projectedHealthFactor: number
  /** When true, the projection is in the "would liquidate" sentinel state. */
  wouldLiquidate?: boolean
  /**
   * When true, the user typed an amount larger than what they have available
   * (lend deposit + pledged collateral). Same red visual as `wouldLiquidate`,
   * but the label reads "Exceeds deposit" since this is a data-entry issue
   * rather than a real liquidation risk.
   */
  exceedsDeposit?: boolean
}

const TIER_COLORS: Record<HealthTier, { fill: string }> = {
  safe: { fill: '#22C55E' },
  caution: { fill: '#F59E0B' },
  danger: { fill: '#EF4444' },
}

export const BorrowHealthCard = memo(function BorrowHealthCard({
  currentLtv,
  projectedLtv,
  maxLtv,
  bufferPct,
  borrowApy,
  collateralAsset,
  collateralValueUsd,
  projectedHealthFactor,
  wouldLiquidate = false,
  exceedsDeposit = false,
}: BorrowHealthCardProps) {
  const currentBarValue = computeHealthBarValue(currentLtv, maxLtv)
  const projectedBarValue = computeHealthBarValue(projectedLtv, maxLtv)
  const projectionTier = computeHealthTier(projectedBarValue)

  const tierColors = TIER_COLORS[projectionTier]
  const currentTierColors = TIER_COLORS[computeHealthTier(currentBarValue)]

  // Bar fill in [0, 100] %
  const currentBarPct = currentBarValue * 100
  const projectedBarPct = wouldLiquidate ? 100 : projectedBarValue * 100
  const showProjection = projectedLtv !== currentLtv
  const isImproving = projectedBarPct < currentBarPct

  // Numeric readings show raw LTV %; at bar=100% the reading equals `maxLtv * 100`.
  const currentLtvPct = currentLtv * 100
  const projectedLtvPct = Math.min(projectedLtv, maxLtv) * 100

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: `1px solid ${wouldLiquidate ? '#FCA5A5' : '#E0E2EB'}`,
        borderRadius: '16px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header: label + percent reading */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <HealthLabelWithTooltip />
        <HealthReading
          currentLtvPct={currentLtvPct}
          projectedLtvPct={projectedLtvPct}
          showProjection={showProjection}
          wouldLiquidate={wouldLiquidate}
          exceedsDeposit={exceedsDeposit}
        />
      </div>

      <BorrowHealthBar
        wouldLiquidate={wouldLiquidate}
        currentBarPct={currentBarPct}
        projectedBarPct={projectedBarPct}
        isImproving={isImproving}
        showProjection={showProjection}
        currentFill={currentTierColors.fill}
        projectedFill={tierColors.fill}
      />

      <BorrowHealthStats
        maxLtv={maxLtv}
        bufferPct={bufferPct}
        borrowApy={borrowApy}
        collateralAsset={collateralAsset}
        collateralValueUsd={collateralValueUsd}
        projectedHealthFactor={projectedHealthFactor}
      />
    </div>
  )
})

function HealthReading({
  currentLtvPct,
  projectedLtvPct,
  showProjection,
  wouldLiquidate,
  exceedsDeposit,
}: {
  currentLtvPct: number
  projectedLtvPct: number
  showProjection: boolean
  wouldLiquidate: boolean
  exceedsDeposit: boolean
}) {
  if (wouldLiquidate) {
    return (
      <span style={{ fontSize: '14px', color: '#B91C1C', fontWeight: 600 }}>
        {exceedsDeposit ? 'Exceeds deposit' : 'Would liquidate'}
      </span>
    )
  }
  if (!showProjection) {
    return (
      <span style={{ fontSize: '14px', color: '#1a1b1e', fontWeight: 600 }}>
        {currentLtvPct.toFixed(1)}%
      </span>
    )
  }
  return (
    <span style={{ fontSize: '14px', color: '#1a1b1e', fontWeight: 600 }}>
      {currentLtvPct.toFixed(1)}% <span style={{ color: '#9195A6' }}>→</span>{' '}
      {projectedLtvPct.toFixed(1)}%
    </span>
  )
}

function HealthLabelWithTooltip() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        color: '#1a1b1e',
        fontSize: '14px',
        fontWeight: 600,
      }}
    >
      Health
      <InfoTooltip text="Loan-to-value against the liquidation point. At 100% you're liquidated; interest pushes it up over time." />
    </span>
  )
}
