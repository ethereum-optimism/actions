/**
 * Borrow Health card.
 *
 * Renders the two-tone health bar (current solid + projected lighter
 * overlay), an info-icon tooltip, and the Liquidation / Borrow APY /
 * Buffer / Collateral rows beneath.
 *
 * Bar fill is `currentLtv / maxLtv` clamped to 1, so bar = 100%
 * coincides with the liquidation LTV (e.g. 86%). The numeric reading
 * shows the raw LTV % so users see the actual loan-to-value rather
 * than a normalized scale. Color tiers stay at 60/80% of bar fill
 * (proportional to liquidation).
 *
 * Used in three flows: Borrow input, Repay input, and Lend-tab withdraw
 * (when collateral is pledged). `healthFactor` is the SDK-canonical
 * Aave-style decimal (1.0 = liquidation, Infinity = no debt).
 */

import { memo, useEffect, useRef, useState } from 'react'
import {
  computeHealthBarValue,
  computeHealthTier,
  type HealthTier,
} from '@/utils/borrowMath'
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

const TIER_COLORS: Record<HealthTier, { fill: string; track: string }> = {
  safe: { fill: '#22C55E', track: '#DCFCE7' },
  caution: { fill: '#F59E0B', track: '#FEF3C7' },
  danger: { fill: '#EF4444', track: '#FEE2E2' },
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

  // Numeric readings show RAW LTV % (not the normalized bar fill), so
  // users see their actual loan-to-value. At bar=100% the reading
  // equals `maxLtv * 100` (e.g. 86%).
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

      {/* Bar */}
      <div
        data-testid="borrow-health-bar-shell"
        style={{
          width: '100%',
          borderRadius: '999px',
          padding: 0,
          boxShadow: wouldLiquidate
            ? '0 0 10px rgba(239, 68, 68, 0.3)'
            : 'none',
          animation: wouldLiquidate
            ? 'borrowHealthLiquidationGlow 2.4s ease-in-out infinite'
            : 'none',
        }}
      >
        <div
          data-testid="borrow-health-bar-track"
          style={{
            height: '6px',
            width: '100%',
            backgroundColor: wouldLiquidate ? '#FEE2E2' : '#E0E2EB',
            borderRadius: '999px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* Current fill — always reflects the live LTV. While a user is
              typing a hypothetical action, this stays put and the delta
              section to its right (or its trim, when the action shrinks
              the position) shows the projected change. */}
          <div
            data-testid="borrow-health-bar-current"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${wouldLiquidate ? 100 : currentBarPct}%`,
              backgroundColor: wouldLiquidate
                ? '#EF4444'
                : currentTierColors.fill,
              transition: 'width 200ms ease-in-out',
            }}
          />
          {/* Delta segment with barbershop-pole stripes — animated to read
              as "tentative". Positioned at min(current, projected) so it
              extends the bar when the action increases LTV, and dims the
              tail when it decreases. Stripe flow direction follows the
              direction the bar's edge is moving: leftward when improving
              (repay / position shrinking), rightward when worsening
              (borrow / position growing). */}
          {!wouldLiquidate &&
            showProjection &&
            projectedBarPct !== currentBarPct && (
              <div
                data-testid="borrow-health-bar-projection"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: `${Math.min(currentBarPct, projectedBarPct)}%`,
                  height: '100%',
                  width: `${Math.abs(projectedBarPct - currentBarPct)}%`,
                  backgroundImage: `repeating-linear-gradient(
                    -45deg,
                    ${isImproving ? currentTierColors.fill : tierColors.fill} 0px,
                    ${isImproving ? currentTierColors.fill : tierColors.fill} 4px,
                    rgba(255, 255, 255, 0.55) 4px,
                    rgba(255, 255, 255, 0.55) 8px
                  )`,
                  // -45deg stripes with an 8px gradient cycle have a
                  // horizontal natural period of 8/√2 ≈ 11.3137px. The
                  // tile width must be an exact multiple of that period
                  // (and the animation distance must match the tile
                  // width) or the loop shows a visible seam where the
                  // pattern wraps. 20 cycles = 226.274px is a round
                  // enough chunk that the animation reads smoothly.
                  backgroundSize: '226.274px 100%',
                  animation: `${
                    isImproving
                      ? 'borrowHealthBarbershopFlowLeft'
                      : 'borrowHealthBarbershopFlowRight'
                  } 20s linear infinite`,
                  opacity: 0.65,
                  transition: 'left 200ms ease-in-out, width 200ms ease-in-out',
                }}
              />
            )}
        </div>
      </div>

      {/* Canonical Aave-style HF (secondary label) */}
      <div
        style={{
          color: '#9195A6',
          fontSize: '12px',
          fontFamily: 'Inter',
        }}
      >
        Health Factor:{' '}
        {Number.isFinite(projectedHealthFactor)
          ? projectedHealthFactor.toFixed(2)
          : '∞'}
      </div>

      {/* Stats rows */}
      <DetailRow
        label="Liquidation at"
        value={`${(maxLtv * 100).toFixed(1)}%`}
      />
      <DetailRow label="Buffer" value={`${(bufferPct * 100).toFixed(0)}%`} />
      <DetailRow
        label="Borrow APY"
        value={`${(borrowApy * 100).toFixed(2)}%`}
      />
      <DetailRow
        label="Collateral"
        value={
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ color: '#9195A6', fontSize: '13px' }}>
              {collateralAsset.metadata.symbol.replace('_DEMO', '')}
            </span>
            <span style={{ color: '#1a1b1e' }}>
              ${collateralValueUsd.toFixed(2)}
            </span>
          </span>
        }
      />
      <style>
        {`
          @keyframes borrowHealthLiquidationGlow {
            0%, 100% {
              box-shadow: 0 0 10px rgba(239, 68, 68, 0.28);
            }
            50% {
              box-shadow: 0 0 18px rgba(239, 68, 68, 0.48);
            }
          }
          /* Increasing background-position shifts the gradient rightward
             (stripes move right); decreasing it shifts left. Match the
             keyframe's visible motion to its name so the consumer
             (Improving → FlowLeft, Worsening → FlowRight) is obvious. */
          @keyframes borrowHealthBarbershopFlowLeft {
            from { background-position: 0 0; }
            to { background-position: -226.274px 0; }
          }
          @keyframes borrowHealthBarbershopFlowRight {
            from { background-position: 0 0; }
            to { background-position: 226.274px 0; }
          }
        `}
      </style>
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

function DetailRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: '#666666', fontSize: '13px' }}>{label}</span>
      <span style={{ color: '#1a1b1e', fontSize: '13px' }}>{value}</span>
    </div>
  )
}

function HealthLabelWithTooltip() {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (show && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setPos({ top: rect.top - 8, left: rect.left + rect.width / 2 })
    }
  }, [show])

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'help',
          color: '#1a1b1e',
          fontSize: '14px',
          fontWeight: 600,
        }}
      >
        Health
        <InlineInfoIcon />
      </span>
      {show && (
        <div
          style={{
            position: 'fixed',
            top: `${pos.top}px`,
            left: `${pos.left}px`,
            transform: 'translate(-50%, -100%)',
            padding: '10px 14px',
            backgroundColor: 'rgba(0, 0, 0, 0.78)',
            color: '#FFFFFF',
            fontSize: '12px',
            lineHeight: 1.4,
            borderRadius: '8px',
            maxWidth: '280px',
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            pointerEvents: 'none',
            fontFamily: 'Inter',
          }}
        >
          Bar fills as your loan-to-value approaches liquidation. The numeric
          reading shows your current LTV; at 100% bar fill you would be
          liquidated. The Max button leaves a safety buffer before that point.
          Interest accrues continuously; your Health drifts even without action.
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '4px solid rgba(0, 0, 0, 0.78)',
            }}
          />
        </div>
      )}
    </>
  )
}

function InlineInfoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5.5" stroke="#9195A6" strokeWidth="1.2" />
      <path
        d="M7 4V7M7 9.25V9.5"
        stroke="#9195A6"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
