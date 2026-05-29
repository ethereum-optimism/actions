/**
 * Desktop layout for the Borrow tab's Active Positions table.
 *
 * Splits into three visually independent sub-tables:
 * Collateral | Borrow APY | Borrowed. Each column has its own header
 * with its own underline, so the eye doesn't try to merge the inner
 * content cells across the divides. Implemented with CSS grid (three
 * columns, N+1 rows) so each "sub-table" stays vertically aligned with
 * the others without a shared <table> element.
 *
 * Each side cell uses `space-between` so the amount-and-asset cluster
 * sits on the inner edge (near the centered APY) and the USD value sits
 * on the outer edge, mirroring the lend-table rhythm.
 */

import { Fragment } from 'react'
import type { BorrowMarketPosition } from '@eth-optimism/actions-sdk'
import { stubPriceUsd } from '@/utils/stubPrices' // retired by #482
import { colors } from '@/constants/colors'
import { getAssetLogo } from '@/constants/logos'
import { formatAmountParts } from '@/utils/tokenDisplay'
import { marketIdKey } from '@/utils/marketId'
import { BorrowApyHeaderLabel } from './BorrowApyHeaderLabel'

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
        // Side columns take equal share of the remaining width; the
        // center column shrinks to fit the APY value. `column-gap` is
        // the visual divider between the three sub-tables.
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
        <BorrowApyHeaderLabel />
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
  const collSymbol = position.collateralAsset.metadata.symbol.replace(
    '_DEMO',
    '',
  )
  const borrSymbol = position.borrowAsset.metadata.symbol.replace('_DEMO', '')
  const rowBg =
    hoveredAction === 'getBorrowPosition'
      ? colors.highlight.background
      : 'transparent'
  const borrowAmount = formatAmountParts(position.borrowAmountFormatted)
  const collateralAmount = formatAmountParts(position.collateralAmountFormatted)
  const collateralValue = formatAmountParts(
    (
      (parseFloat(position.collateralAmountFormatted) || 0) *
      stubPriceUsd(position.collateralAsset.metadata.symbol)
    ).toFixed(4),
  )
  const borrowValue = formatAmountParts(
    (
      (parseFloat(position.borrowAmountFormatted) || 0) *
      stubPriceUsd(position.borrowAsset.metadata.symbol)
    ).toFixed(4),
  )
  return (
    <>
      <BodyCell bg={rowBg} layout="space-between">
        <AssetAmount
          amount={collateralAmount}
          logo={getAssetLogo(position.collateralAsset.metadata.symbol)}
          symbol={collSymbol}
          fontWeight={500}
        />
        <UsdValue value={collateralValue} />
      </BodyCell>
      <BodyCell bg={rowBg} layout="center">
        {(position.borrowApy * 100).toFixed(2)}%
      </BodyCell>
      <BodyCell bg={rowBg} layout="space-between">
        <AssetAmount
          amount={borrowAmount}
          logo={getAssetLogo(position.borrowAsset.metadata.symbol)}
          symbol={borrSymbol}
          fontWeight={500}
        />
        <UsdValue value={borrowValue} fontWeight={500} />
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
        <span
          className="positions-table-secondary-digits"
          style={{ color: '#9195A6', fontSize: '12px' }}
        >
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
      <span
        className="positions-table-secondary-digits"
        style={{ color: '#9195A6', fontSize: '12px' }}
      >
        {value.secondary}
      </span>
    </span>
  )
}
