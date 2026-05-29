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
import { AssetAmount, deriveBorrowRowDisplay } from './BorrowPositionsCells'

type Align = 'flex-start' | 'center' | 'flex-end'

type AmountParts = { main: string; secondary: string }

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
              <StackedAmount
                amount={d.collateralAmount}
                logo={d.collLogo}
                symbol={d.collSymbol}
                value={d.collateralValue}
              />
            </BodyCell>
            <BodyCell bg={bg} align="center" first={idx === 0}>
              <span style={{ fontSize: '14px', color: '#1a1b1e' }}>
                {d.apy}
              </span>
            </BodyCell>
            <BodyCell bg={bg} align="flex-end" first={idx === 0}>
              <StackedAmount
                amount={d.borrowAmount}
                logo={d.borrLogo}
                symbol={d.borrSymbol}
                value={d.borrowValue}
              />
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

/**
 * Stacks the asset amount over its USD value with the digits aligned in a
 * shared content column. The `$` lives in an auto-width gutter column
 * (empty on the amount row) so it hangs left of the value without pushing
 * the digits out of line with the amount above.
 */
function StackedAmount({
  amount,
  logo,
  symbol,
  value,
}: {
  amount: AmountParts
  logo: string
  symbol: string
  value: AmountParts
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto auto',
        rowGap: '2px',
        alignItems: 'baseline',
      }}
    >
      <span />
      <AssetAmount
        amount={amount}
        logo={logo}
        symbol={symbol}
        fontWeight={500}
      />
      <span
        style={{
          color: '#1a1b1e',
          fontSize: '14px',
          fontWeight: 500,
          fontFamily: 'Inter',
        }}
      >
        $
      </span>
      <span
        style={{
          color: '#1a1b1e',
          fontSize: '14px',
          fontWeight: 500,
          fontFamily: 'Inter',
          whiteSpace: 'nowrap',
        }}
      >
        {value.main}
        <span
          className="positions-table-secondary-digits"
          style={{ color: '#9195A6', fontSize: '12px' }}
        >
          {value.secondary}
        </span>
      </span>
    </div>
  )
}
