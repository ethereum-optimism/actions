/**
 * Active Positions table for the Borrow tab.
 *
 * Three-column desktop layout: Collateral | Borrow APY | Borrowed.
 * Each side cell uses `space-between` so the amount-and-asset cluster sits
 * on the inner edge and the USD value sits on the outer edge; this gives
 * a symmetric "value at the edges, units toward the centered APY" rhythm.
 * Mobile uses a stacked-card layout.
 *
 * Active highlight is wired to the `getBorrowPosition` activity action so
 * the card lights up when a matching log entry is hovered.
 */

import { useEffect, useRef, useState } from 'react'
import type { BorrowMarketPosition } from '@eth-optimism/actions-sdk'
import { stubPriceUsd } from '@/api/borrowApi'
import { useActivityHighlight } from '@/contexts/ActivityHighlightContext'
import { colors } from '@/constants/colors'
import { getAssetLogo } from '@/constants/logos'
import { PositionsTable } from '../PositionsTable'

export interface BorrowPositionsProps {
  positions: readonly BorrowMarketPosition[]
}

function formatDisplayAmount(amount: string) {
  const num = parseFloat(amount)
  if (Number.isNaN(num)) return { main: '0.00', secondary: '00' }

  const formatted = num.toFixed(4)
  const [wholePart, decimalPart = '0000'] = formatted.split('.')

  return {
    main: `${wholePart}.${decimalPart.substring(0, 2)}`,
    secondary: decimalPart.substring(2, 4),
  }
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
          <Th align="left">Collateral</Th>
          <Th align="center">
            <BorrowApyHeaderLabel />
          </Th>
          <Th align="right">Borrowed</Th>
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
  const borrowAmount = formatDisplayAmount(position.borrowAmountFormatted)
  const collateralAmount = formatDisplayAmount(
    position.collateralAmountFormatted,
  )
  const collateralValue = formatDisplayAmount(
    (
      (parseFloat(position.collateralAmountFormatted) || 0) *
      stubPriceUsd(position.collateralAsset.metadata.symbol)
    ).toFixed(4),
  )
  const borrowValue = formatDisplayAmount(
    (
      (parseFloat(position.borrowAmountFormatted) || 0) *
      stubPriceUsd(position.borrowAsset.metadata.symbol)
    ).toFixed(4),
  )
  return (
    <tr>
      {/* Collateral cell: amount + logo + symbol on the left, USD on the
          right (inner edge, near the centered APY). */}
      <Td bg={positionRowBg}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <AssetAmount
            amount={collateralAmount}
            logo={getAssetLogo(position.collateralAsset.metadata.symbol)}
            symbol={collSymbol}
            fontWeight={500}
          />
          <UsdValue value={collateralValue} />
        </span>
      </Td>
      <Td bg={positionRowBg} align="center">
        {(position.borrowApy * 100).toFixed(2)}%
      </Td>
      {/* Borrowed cell: amount + logo + symbol on the left (inner edge,
          near APY), USD on the right (outer edge). */}
      <Td bg={positionRowBg}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <AssetAmount
            amount={borrowAmount}
            logo={getAssetLogo(position.borrowAsset.metadata.symbol)}
            symbol={borrSymbol}
            fontWeight={500}
          />
          <UsdValue value={borrowValue} fontWeight={500} />
        </span>
      </Td>
    </tr>
  )
}

function AssetAmount({
  amount,
  logo,
  symbol,
  fontWeight = 400,
}: {
  amount: { main: string; secondary: string }
  logo: string
  symbol: string
  fontWeight?: number
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        color: '#1a1b1e',
        fontSize: '14px',
        fontFamily: 'Inter',
        fontWeight,
        whiteSpace: 'nowrap',
      }}
    >
      <span>
        {amount.main}
        <span style={{ color: '#9195A6', fontSize: '12px' }}>
          {amount.secondary}
        </span>
      </span>
      <img
        src={logo}
        alt={symbol}
        style={{ width: '20px', height: '20px', borderRadius: '50%' }}
      />
      <span className="positions-table-asset-label">{symbol}</span>
    </span>
  )
}

function UsdValue({
  value,
  fontWeight = 400,
}: {
  value: { main: string; secondary: string }
  fontWeight?: number
}) {
  return (
    <span
      style={{
        color: '#1a1b1e',
        fontSize: '14px',
        fontFamily: 'Inter',
        fontWeight,
        whiteSpace: 'nowrap',
      }}
    >
      ${value.main}
      <span style={{ color: '#9195A6', fontSize: '12px' }}>
        {value.secondary}
      </span>
    </span>
  )
}

/**
 * "Borrow APY" header label with a help-cursor info icon. Hovering the
 * label shows a tooltip explaining how the rate is computed and behaves.
 * Wording is grounded in Morpho's IRM docs: the rate is per-second,
 * applied with continuous compounding (`(1 + r)^secondsPerYear - 1` in
 * effect), and adjusts as the market's utilization moves relative to its
 * target.
 */
function BorrowApyHeaderLabel() {
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
          gap: '4px',
          cursor: 'help',
        }}
      >
        Borrow APY
        <InfoIcon />
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
            textAlign: 'left',
            fontWeight: 400,
          }}
        >
          The annualized interest rate paid on your borrowed amount. Interest
          accrues to your debt continuously, and the rate adjusts as the
          market's utilization changes.
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

function InfoIcon() {
  return (
    <svg
      width="12"
      height="12"
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
                  color: '#1a1b1e',
                  fontSize: '14px',
                  fontWeight: 600,
                  fontFamily: 'Inter',
                }}
              >
                $
                {
                  formatDisplayAmount(
                    (
                      (parseFloat(p.borrowAmountFormatted) || 0) *
                      stubPriceUsd(p.borrowAsset.metadata.symbol)
                    ).toFixed(4),
                  ).main
                }
                <span style={{ color: '#C2C5D0' }}>
                  {
                    formatDisplayAmount(
                      (
                        (parseFloat(p.borrowAmountFormatted) || 0) *
                        stubPriceUsd(p.borrowAsset.metadata.symbol)
                      ).toFixed(4),
                    ).secondary
                  }
                </span>
              </span>
            </div>
            <div
              style={{
                color: '#9195A6',
                fontSize: '12px',
                fontFamily: 'Inter',
              }}
            >
              {formatDisplayAmount(p.borrowAmountFormatted).main}
              <span style={{ color: '#C2C5D0' }}>
                {formatDisplayAmount(p.borrowAmountFormatted).secondary}
              </span>{' '}
              {p.borrowAsset.metadata.symbol.replace('_DEMO', '')} ·{' '}
              {(p.borrowApy * 100).toFixed(2)}% APY · Coll{' '}
              {p.collateralAsset.metadata.symbol.replace('_DEMO', '')} $
              {formatDisplayAmount(p.collateralAmountFormatted).main}
              <span style={{ color: '#C2C5D0' }}>
                {formatDisplayAmount(p.collateralAmountFormatted).secondary}
              </span>
            </div>
          </div>
        )
      })}
    </>
  )
}

function Th({
  align = 'left',
  minWidth,
  children,
}: {
  align?: 'left' | 'center' | 'right'
  minWidth?: string
  children: React.ReactNode
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: '12px 6px',
        color: '#9195A6',
        fontSize: '12px',
        fontWeight: 500,
        fontFamily: 'Inter',
        minWidth,
      }}
    >
      {children}
    </th>
  )
}

function Td({
  bg,
  align = 'left',
  fontWeight = 400,
  children,
}: {
  bg: string
  align?: 'left' | 'center' | 'right'
  fontWeight?: number
  children: React.ReactNode
}) {
  return (
    <td
      className="transition-all"
      style={{
        padding: '16px 6px',
        textAlign: align,
        backgroundColor: bg,
        color: '#1a1b1e',
        fontSize: '14px',
        fontWeight,
        fontFamily: 'Inter',
      }}
    >
      {children}
    </td>
  )
}

function positionKey(p: BorrowMarketPosition): string {
  if (p.marketId.kind === 'morpho-blue') {
    return `${p.marketId.kind}-${p.marketId.marketId}-${p.marketId.chainId}`
  }
  return `unknown-${p.marketId.chainId}`
}
