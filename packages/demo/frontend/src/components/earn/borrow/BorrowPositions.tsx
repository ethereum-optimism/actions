/**
 * Active Positions table for the Borrow tab.
 *
 * Thin wrapper around the extracted `<PositionsTable>` chrome. Renders
 * Asset / Amount / Borrow APY / Collateral / Health columns on desktop;
 * mobile uses a stacked-card layout. Active highlight is wired to the
 * `getBorrowPosition` activity action so the card lights up when a
 * matching log entry is hovered.
 */

import type { BorrowMarketPosition } from '@eth-optimism/actions-sdk'
import { useActivityHighlight } from '@/contexts/ActivityHighlightContext'
import { colors } from '@/constants/colors'
import {
  computeHealthBarValue,
  computeHealthTier,
  type HealthTier,
} from '@/utils/borrowMath'
import { PositionsTable } from '../PositionsTable'

const TIER_TEXT: Record<HealthTier, string> = {
  safe: '#22C55E',
  caution: '#F59E0B',
  danger: '#EF4444',
}

export interface BorrowPositionsProps {
  positions: readonly BorrowMarketPosition[]
}

export function BorrowPositions({ positions }: BorrowPositionsProps) {
  const { hoveredAction } = useActivityHighlight()
  const isCardHighlighted =
    hoveredAction === 'getBorrowPosition' ||
    hoveredAction === 'getBorrowMarkets'

  if (positions.length === 0) return null

  return (
    <PositionsTable
      title="Active Positions"
      isCardHighlighted={isCardHighlighted}
      desktopTable={
        <DesktopTable positions={positions} hoveredAction={hoveredAction} />
      }
      mobileLayout={
        <MobileCards positions={positions} hoveredAction={hoveredAction} />
      }
    />
  )
}

function DesktopTable({
  positions,
  hoveredAction,
}: {
  positions: readonly BorrowMarketPosition[]
  hoveredAction: string | null
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #E0E2EB' }}>
          <Th align="left">Asset</Th>
          <Th align="right">Amount</Th>
          <Th align="right">Borrow APY</Th>
          <Th align="right">Collateral</Th>
          <Th align="right">Health Factor</Th>
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => (
          <BorrowRow
            key={positionKey(p)}
            position={p}
            hoveredAction={hoveredAction}
          />
        ))}
      </tbody>
    </table>
  )
}

function BorrowRow({
  position,
  hoveredAction,
}: {
  position: BorrowMarketPosition
  hoveredAction: string | null
}) {
  const collSymbol = position.collateralAsset.metadata.symbol.replace(
    '_DEMO',
    '',
  )
  const borrSymbol = position.borrowAsset.metadata.symbol.replace('_DEMO', '')
  const positionRowBg =
    hoveredAction === 'getBorrowPosition'
      ? colors.highlight.background
      : 'transparent'
  const tier = healthTierForPosition(position)
  return (
    <tr>
      <Td bg={positionRowBg}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <DotIcon />
          <span
            style={{
              color: '#1a1b1e',
              fontSize: '14px',
              fontFamily: 'Inter',
            }}
          >
            {position.borrowAsset.metadata.name}
          </span>
        </span>
      </Td>
      <Td bg={positionRowBg} align="right">
        {position.borrowAmountFormatted} {borrSymbol}
      </Td>
      <Td bg={positionRowBg} align="right">
        {(position.borrowApy * 100).toFixed(2)}%
      </Td>
      <Td bg={positionRowBg} align="right">
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: '#1a1b1e',
            fontSize: '14px',
            fontFamily: 'Inter',
          }}
        >
          <DotIcon />
          {collSymbol} $
          {(parseFloat(position.collateralAmountFormatted) || 0).toFixed(2)}
        </span>
      </Td>
      <Td bg={positionRowBg} align="right">
        <span
          style={{
            color: TIER_TEXT[tier],
            fontWeight: 600,
            fontSize: '14px',
            fontFamily: 'Inter',
          }}
        >
          {healthBarReading(position)}
        </span>
      </Td>
    </tr>
  )
}

function MobileCards({
  positions,
  hoveredAction,
}: {
  positions: readonly BorrowMarketPosition[]
  hoveredAction: string | null
}) {
  return (
    <>
      {positions.map((p, idx) => {
        return (
          <div
            key={`mobile-${positionKey(p)}`}
            style={{
              borderTop: idx > 0 ? '1px solid #E0E2EB' : 'none',
              paddingTop: idx > 0 ? '12px' : '0',
              backgroundColor:
                hoveredAction === 'getBorrowPosition'
                  ? colors.highlight.background
                  : 'transparent',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px',
              }}
            >
              <span
                style={{
                  color: '#1a1b1e',
                  fontSize: '14px',
                  fontWeight: 500,
                  fontFamily: 'Inter',
                }}
              >
                {p.borrowAsset.metadata.name}
              </span>
              <span
                style={{
                  color: TIER_TEXT[healthTierForPosition(p)],
                  fontSize: '14px',
                  fontWeight: 600,
                  fontFamily: 'Inter',
                }}
              >
                {healthBarReading(p)}
              </span>
            </div>
            <div
              style={{
                color: '#9195A6',
                fontSize: '12px',
                fontFamily: 'Inter',
              }}
            >
              {p.borrowAmountFormatted}{' '}
              {p.borrowAsset.metadata.symbol.replace('_DEMO', '')} ·{' '}
              {(p.borrowApy * 100).toFixed(2)}% APY · Coll{' '}
              {p.collateralAsset.metadata.symbol.replace('_DEMO', '')} $
              {(parseFloat(p.collateralAmountFormatted) || 0).toFixed(2)}
            </div>
          </div>
        )
      })}
    </>
  )
}

function Th({
  align = 'left',
  children,
}: {
  align?: 'left' | 'right'
  children: React.ReactNode
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: '12px 8px',
        color: '#9195A6',
        fontSize: '12px',
        fontWeight: 500,
        fontFamily: 'Inter',
      }}
    >
      {children}
    </th>
  )
}

function Td({
  bg,
  align = 'left',
  children,
}: {
  bg: string
  align?: 'left' | 'right'
  children: React.ReactNode
}) {
  return (
    <td
      className="transition-all"
      style={{
        padding: '16px 8px',
        textAlign: align,
        backgroundColor: bg,
        color: '#1a1b1e',
        fontSize: '14px',
        fontWeight: 400,
        fontFamily: 'Inter',
      }}
    >
      {children}
    </td>
  )
}

function DotIcon() {
  return (
    <span
      style={{
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        backgroundColor: '#F5F5F7',
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  )
}

function healthTierForPosition(p: BorrowMarketPosition): HealthTier {
  const maxLtv = p.maxLtv ?? 0
  const ltv = p.ltv ?? 0
  return computeHealthTier(computeHealthBarValue(ltv, maxLtv))
}

function healthBarReading(p: BorrowMarketPosition): string {
  // Numeric reading is the raw LTV %, matching <BorrowHealthCard>'s
  // header semantics (bar=100% maps to maxLtv * 100%).
  const maxLtv = p.maxLtv ?? 0
  const ltv = Math.min(p.ltv ?? 0, maxLtv)
  return `${(ltv * 100).toFixed(1)}%`
}

function positionKey(p: BorrowMarketPosition): string {
  if (p.marketId.kind === 'morpho-blue') {
    return `${p.marketId.kind}-${p.marketId.marketId}-${p.marketId.chainId}`
  }
  return `unknown-${p.marketId.chainId}`
}
