/**
 * Desktop layout for the Borrow tab's Active Positions table. Splits into three
 * visually independent sub-tables (Collateral | Borrow APY | Borrowed) via a
 * CSS grid so columns stay aligned without a shared <table>. Side cells use
 * `space-between` to push the asset cluster inward and the USD value outward.
 */

import { Fragment } from 'react'
import type { BorrowMarketPosition } from '@eth-optimism/actions-sdk'
import { colors } from '@/constants/colors'
import { marketIdKey } from '@/utils/marketId'
import { InfoTooltip } from '../InfoTooltip'
import {
  AssetAmount,
  UsdValue,
  deriveBorrowRowDisplay,
} from './BorrowPositionsCells'

const BORROW_APY_TOOLTIP =
  'The annualized interest rate paid on your borrowed amount. Interest ' +
  "accrues to your debt continuously, and the rate adjusts as the market's " +
  'utilization changes.'

export function DesktopTable({
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
        // Side columns split remaining width; the center shrinks to the APY value, and `column-gap` divides the sub-tables.
        gridTemplateColumns: '1fr auto 1fr',
        columnGap: '48px',
        alignItems: 'stretch',
      }}
    >
      <HeaderCell layout="space-between">
        <span>Collateral</span>
        <span>Value</span>
      </HeaderCell>
      <HeaderCell layout="center">
        <InfoTooltip label="APY" text={BORROW_APY_TOOLTIP} />
      </HeaderCell>
      <HeaderCell layout="space-between">
        <span>Borrowed</span>
        <span>Value</span>
      </HeaderCell>

      {positions.map((p) => (
        <Fragment key={marketIdKey(p.marketId)}>
          <BorrowRowCells position={p} hoveredAction={hoveredAction} />
        </Fragment>
      ))}
    </div>
  )
}

function BorrowRowCells({
  position,
  hoveredAction,
}: {
  position: BorrowMarketPosition
  hoveredAction: string | null
}) {
  const d = deriveBorrowRowDisplay(position)
  const rowBg =
    hoveredAction === 'getBorrowPosition'
      ? colors.highlight.background
      : 'transparent'
  return (
    <>
      <BodyCell bg={rowBg} layout="space-between">
        <AssetAmount
          amount={d.collateralAmount}
          logo={d.collLogo}
          symbol={d.collSymbol}
          fontWeight={500}
        />
        <UsdValue value={d.collateralValue} fontWeight={500} />
      </BodyCell>
      <BodyCell bg={rowBg} layout="center">
        {d.apy}
      </BodyCell>
      <BodyCell bg={rowBg} layout="space-between">
        <AssetAmount
          amount={d.borrowAmount}
          logo={d.borrLogo}
          symbol={d.borrSymbol}
          fontWeight={500}
        />
        <UsdValue value={d.borrowValue} fontWeight={500} />
      </BodyCell>
    </>
  )
}

function HeaderCell({
  layout,
  children,
}: {
  layout: 'center' | 'space-between'
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        padding: '12px 6px',
        color: '#9195A6',
        fontSize: '12px',
        fontWeight: 500,
        fontFamily: 'Inter',
        borderBottom: '1px solid #E0E2EB',
        display: 'flex',
        alignItems: 'center',
        justifyContent: layout,
        gap: '12px',
      }}
    >
      {children}
    </div>
  )
}

function BodyCell({
  bg,
  layout,
  children,
}: {
  bg: string
  layout: 'center' | 'space-between'
  children: React.ReactNode
}) {
  return (
    <div
      className="transition-all"
      style={{
        padding: '16px 6px',
        backgroundColor: bg,
        color: '#1a1b1e',
        fontSize: '14px',
        fontFamily: 'Inter',
        display: 'flex',
        alignItems: 'center',
        justifyContent: layout,
        gap: '12px',
      }}
    >
      {children}
    </div>
  )
}
