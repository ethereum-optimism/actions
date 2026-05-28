/**
 * Active Positions table for the Borrow tab.
 *
 * Thin wrapper around the extracted `<PositionsTable>` chrome. Renders
 * Asset / Amount / Borrow APY / Collateral / Value columns on desktop;
 * mobile uses a stacked-card layout. Active highlight is wired to the
 * `getBorrowPosition` activity action so the card lights up when a
 * matching log entry is hovered.
 */

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
          <Th align="left" minWidth="120px">
            Asset
          </Th>
          <Th align="right" minWidth="90px">
            Borrow APY
          </Th>
          <Th align="right" minWidth="120px">
            Collateral
          </Th>
          <Th align="right" minWidth="130px">
            Amount
          </Th>
          <Th align="right" minWidth="100px">
            Value
          </Th>
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
  const borrowValue = formatDisplayAmount(
    (
      (parseFloat(position.borrowAmountFormatted) || 0) *
      stubPriceUsd(position.borrowAsset.metadata.symbol)
    ).toFixed(4),
  )
  return (
    <tr>
      <Td bg={positionRowBg}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img
            src={getAssetLogo(position.borrowAsset.metadata.symbol)}
            alt={borrSymbol}
            style={{ width: '24px', height: '24px', borderRadius: '50%' }}
          />
          <span
            className="positions-table-asset-label"
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
        {(position.borrowApy * 100).toFixed(2)}%
      </Td>
      <Td bg={positionRowBg} align="right">
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            justifyContent: 'flex-end',
            color: '#1a1b1e',
            fontSize: '14px',
            fontFamily: 'Inter',
          }}
        >
          <img
            src={getAssetLogo(position.collateralAsset.metadata.symbol)}
            alt={collSymbol}
            style={{ width: '20px', height: '20px', borderRadius: '50%' }}
          />
          {collateralAmount.main}
          <span style={{ color: '#9195A6', fontSize: '12px' }}>
            {collateralAmount.secondary}
          </span>{' '}
          {collSymbol}
        </span>
      </Td>
      <Td bg={positionRowBg} align="right" fontWeight={500}>
        {borrowAmount.main}
        <span style={{ color: '#9195A6', fontSize: '12px' }}>
          {borrowAmount.secondary}
        </span>{' '}
        {borrSymbol}
      </Td>
      <Td bg={positionRowBg} align="right" fontWeight={500}>
        <span
          style={{
            color: '#1a1b1e',
            fontSize: '14px',
            fontFamily: 'Inter',
          }}
        >
          ${borrowValue.main}
          <span style={{ color: '#9195A6', fontSize: '12px' }}>
            {borrowValue.secondary}
          </span>
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
  align?: 'left' | 'right'
  minWidth?: string
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
  align?: 'left' | 'right'
  fontWeight?: number
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
