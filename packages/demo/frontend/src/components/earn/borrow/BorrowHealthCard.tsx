/**
 * Borrow Health card.
 *
 * Renders the two-tone health bar (current solid + projected lighter
 * overlay), an info-icon tooltip explaining the safe-ceiling model,
 * and the Liquidation / Borrow APY / Collateral / Buffer rows beneath.
 *
 * Used in three flows: Borrow input, Repay input, and Lend-tab withdraw
 * (when collateral is pledged). All three pass `current`, `projected`,
 * `liquidationLtv`, and `borrowApy` from their respective contexts.
 * The component never recomputes `healthFactor` from a backend value;
 * it always derives the bar from `currentLtv` and `safeCeilingLtv`
 * (PR #3 single-source-of-truth guarantee).
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
  safeCeilingLtv: number
  /** LLTV (the actual liquidation threshold) for the "Liquidation at" row. */
  maxLtv: number
  bufferPct: number
  borrowApy: number
  collateralAsset: Asset
  collateralValueUsd: number
  /** Aave-style HF surfaced as a small secondary numeric (PR #3 contract). */
  projectedHealthFactor: number
  /** When true, the projection is in the "would liquidate" sentinel state. */
  wouldLiquidate?: boolean
}

const TIER_COLORS: Record<HealthTier, { fill: string; track: string }> = {
  safe: { fill: '#22C55E', track: '#DCFCE7' },
  caution: { fill: '#F59E0B', track: '#FEF3C7' },
  danger: { fill: '#EF4444', track: '#FEE2E2' },
  buffer: { fill: '#B91C1C', track: '#FEE2E2' },
}

export const BorrowHealthCard = memo(function BorrowHealthCard({
  currentLtv,
  projectedLtv,
  safeCeilingLtv,
  maxLtv,
  bufferPct,
  borrowApy,
  collateralAsset,
  collateralValueUsd,
  projectedHealthFactor,
  wouldLiquidate = false,
}: BorrowHealthCardProps) {
  const currentBarValue = computeHealthBarValue(currentLtv, safeCeilingLtv)
  const projectedBarValue = computeHealthBarValue(projectedLtv, safeCeilingLtv)
  const projectionTier = computeHealthTier(projectedBarValue)

  const tierColors = TIER_COLORS[projectionTier]

  // Visual: clamp bar fill to 100% so the "buffer zone" reads as bar=full
  // plus warning copy, not as a >100% overflow.
  const currentPct = Math.min(100, currentBarValue * 100)
  const projectedPct = Math.min(100, projectedBarValue * 100)

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E0E2EB',
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
          currentPct={currentPct}
          projectedPct={projectedPct}
          showProjection={projectedLtv !== currentLtv}
          wouldLiquidate={wouldLiquidate}
        />
      </div>

      {/* Bar */}
      <div
        style={{
          height: '6px',
          width: '100%',
          backgroundColor: '#E0E2EB',
          borderRadius: '999px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Current fill */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${currentPct}%`,
            backgroundColor:
              TIER_COLORS[computeHealthTier(currentBarValue)].fill,
            transition: 'width 200ms ease-in-out',
          }}
        />
        {/* Projected overlay (lighter, between current and projected) */}
        {projectedPct > currentPct && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: `${currentPct}%`,
              height: '100%',
              width: `${projectedPct - currentPct}%`,
              backgroundColor: tierColors.fill,
              opacity: 0.4,
              transition: 'all 200ms ease-in-out',
            }}
          />
        )}
      </div>

      {/* Buffer-zone warning + canonical HF */}
      {projectionTier === 'buffer' && (
        <div
          style={{
            color: '#B91C1C',
            fontSize: '13px',
            fontFamily: 'Inter',
          }}
        >
          Position is in the buffer zone (past the safe ceiling).
        </div>
      )}
      {!wouldLiquidate && Number.isFinite(projectedHealthFactor) && (
        <div
          style={{
            color: '#9195A6',
            fontSize: '12px',
            fontFamily: 'Inter',
          }}
        >
          Health Factor: {projectedHealthFactor.toFixed(2)}
        </div>
      )}

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
    </div>
  )
})

function HealthReading({
  currentPct,
  projectedPct,
  showProjection,
  wouldLiquidate,
}: {
  currentPct: number
  projectedPct: number
  showProjection: boolean
  wouldLiquidate: boolean
}) {
  if (wouldLiquidate) {
    return (
      <span style={{ fontSize: '14px', color: '#B91C1C', fontWeight: 600 }}>
        Would liquidate
      </span>
    )
  }
  if (!showProjection) {
    return (
      <span style={{ fontSize: '14px', color: '#1a1b1e', fontWeight: 600 }}>
        {currentPct.toFixed(1)}%
      </span>
    )
  }
  return (
    <span style={{ fontSize: '14px', color: '#1a1b1e', fontWeight: 600 }}>
      {currentPct.toFixed(1)}% <span style={{ color: '#9195A6' }}>→</span>{' '}
      {projectedPct.toFixed(1)}%
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
          The bar fills to 100% at the safe ceiling (LLTV minus the buffer), not
          at liquidation. A position past 100% is in the buffer zone between
          safe and liquidation. Interest accrues continuously; your Health
          drifts even without action.
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
