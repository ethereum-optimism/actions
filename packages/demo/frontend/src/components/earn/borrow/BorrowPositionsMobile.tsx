/**
 * Mobile layout for the Borrow tab's Active Positions table.
 *
 * Mirrors the desktop grid's three separate sub-tables
 * (Collateral | APY | Borrowed) but compacts for narrow widths: the
 * column gap is tight and each side cell stacks the USD value beneath the
 * asset amount instead of spreading them apart. Active highlight is wired
 * to the `getBorrowPosition` activity action.
 */

import { Fragment } from 'react'
import type { BorrowMarketPosition } from '@eth-optimism/actions-sdk'
import { colors } from '@/constants/colors'
import { marketIdKey } from '@/utils/marketId'
import {
  AssetAmount,
  UsdValue,
  deriveBorrowRowDisplay,
} from './BorrowPositionsCells'

type Align = 'flex-start' | 'center' | 'flex-end'

export function MobileCards({
  positions,
  hoveredAction,
}: {
  positions: readonly BorrowMarketPosition[]
  hoveredAction: string | null
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        columnGap: '12px',
        alignItems: 'stretch',
      }}
    >
      <HeaderCell align="flex-start">Collateral</HeaderCell>
      <HeaderCell align="center">APY</HeaderCell>
      <HeaderCell align="flex-end">Borrowed</HeaderCell>

      {positions.map((p, idx) => {
        const d = deriveBorrowRowDisplay(p)
        const bg =
          hoveredAction === 'getBorrowPosition'
            ? colors.highlight.background
            : 'transparent'
        return (
          <Fragment key={marketIdKey(p.marketId)}>
            <BodyCell bg={bg} align="flex-start" first={idx === 0}>
              <AssetAmount
                amount={d.collateralAmount}
                logo={d.collLogo}
                symbol={d.collSymbol}
                fontWeight={500}
              />
              <UsdValue value={d.collateralValue} fontWeight={500} />
            </BodyCell>
            <BodyCell bg={bg} align="center" first={idx === 0}>
              <span style={{ fontSize: '14px', color: '#1a1b1e' }}>
                {d.apy}
              </span>
            </BodyCell>
            <BodyCell bg={bg} align="flex-end" first={idx === 0}>
              <AssetAmount
                amount={d.borrowAmount}
                logo={d.borrLogo}
                symbol={d.borrSymbol}
                fontWeight={500}
              />
              <UsdValue value={d.borrowValue} fontWeight={500} />
            </BodyCell>
          </Fragment>
        )
      })}
    </div>
  )
}

function HeaderCell({
  align,
  children,
}: {
  align: Align
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        padding: '0 0 8px',
        color: '#9195A6',
        fontSize: '12px',
        fontWeight: 500,
        fontFamily: 'Inter',
        borderBottom: '1px solid #E0E2EB',
        display: 'flex',
        justifyContent: align,
      }}
    >
      {children}
    </div>
  )
}

function BodyCell({
  bg,
  align,
  first,
  children,
}: {
  bg: string
  align: Align
  first: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className="transition-all"
      style={{
        backgroundColor: bg,
        padding: '12px 4px',
        borderTop: first ? 'none' : '1px solid #E0E2EB',
        display: 'flex',
        flexDirection: 'column',
        alignItems: align,
        justifyContent: 'center',
        gap: '2px',
      }}
    >
      {children}
    </div>
  )
}
