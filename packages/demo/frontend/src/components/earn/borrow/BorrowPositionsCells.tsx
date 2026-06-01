/**
 * Shared cell atoms and value derivation for the Borrow tab's Active
 * Positions table. Used by both the desktop grid and the mobile cards so
 * the two layouts stay visually in sync.
 */

import type { BorrowMarketPosition } from '@eth-optimism/actions-sdk'
import { stubPriceUsd } from '@/utils/stubPrices' // retired by #482
import { getAssetLogo } from '@/constants/logos'
import { displaySymbol, formatAmountParts } from '@/utils/tokenDisplay'
import { isEthSymbol } from '@/utils/assetUtils'

type AmountParts = { main: string; secondary: string }

export interface BorrowRowDisplay {
  collSymbol: string
  borrSymbol: string
  collLogo: string
  borrLogo: string
  collateralAmount: AmountParts
  borrowAmount: AmountParts
  collateralValue: AmountParts
  borrowValue: AmountParts
  apy: string
}

export function deriveBorrowRowDisplay(
  position: BorrowMarketPosition,
): BorrowRowDisplay {
  const collMeta = position.collateralAsset.metadata
  const borrMeta = position.borrowAsset.metadata
  const collateralUsd =
    (parseFloat(position.collateralAmountFormatted) || 0) *
    stubPriceUsd(collMeta.symbol)
  const borrowUsd =
    (parseFloat(position.borrowAmountFormatted) || 0) *
    stubPriceUsd(borrMeta.symbol)
  return {
    collSymbol: displaySymbol(collMeta.symbol),
    borrSymbol: displaySymbol(borrMeta.symbol),
    collLogo: getAssetLogo(collMeta.symbol),
    borrLogo: getAssetLogo(borrMeta.symbol),
    collateralAmount: formatAmountParts(
      position.collateralAmountFormatted,
      isEthSymbol(collMeta.symbol),
    ),
    borrowAmount: formatAmountParts(
      position.borrowAmountFormatted,
      isEthSymbol(borrMeta.symbol),
    ),
    collateralValue: formatAmountParts(collateralUsd.toFixed(2)),
    borrowValue: formatAmountParts(borrowUsd.toFixed(2)),
    apy: `${(position.borrowApy * 100).toFixed(2)}%`,
  }
}

export function AssetAmount({
  amount,
  logo,
  symbol,
  fontWeight = 400,
}: {
  amount: AmountParts
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
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontWeight }}>
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

export function UsdValue({
  value,
  fontWeight = 400,
}: {
  value: AmountParts
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
