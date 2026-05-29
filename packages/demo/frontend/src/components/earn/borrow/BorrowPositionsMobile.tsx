/**
 * Mobile stacked-card layout for the Borrow tab's Active Positions table.
 *
 * Active highlight is wired to the `getBorrowPosition` activity action so
 * the card lights up when a matching log entry is hovered.
 */

import type { BorrowMarketPosition } from '@eth-optimism/actions-sdk'
import { stubPriceUsd } from '@/utils/stubPrices' // retired by #482
import { colors } from '@/constants/colors'
import { formatAmountParts } from '@/utils/tokenDisplay'
import { marketIdKey } from '@/utils/marketId'

export function MobileCards({
  positions,
  hoveredAction,
}: {
  positions: readonly BorrowMarketPosition[]
  hoveredAction: string | null
}) {
  return (
    <>
      {positions.map((p, idx) => {
        const borrowUsd = formatAmountParts(
          (
            (parseFloat(p.borrowAmountFormatted) || 0) *
            stubPriceUsd(p.borrowAsset.metadata.symbol)
          ).toFixed(4),
        )
        const borrowAmount = formatAmountParts(p.borrowAmountFormatted)
        const collateralAmount = formatAmountParts(p.collateralAmountFormatted)
        return (
          <div
            key={`mobile-${marketIdKey(p.marketId)}`}
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
                ${borrowUsd.main}
                <span style={{ color: '#C2C5D0' }}>{borrowUsd.secondary}</span>
              </span>
            </div>
            <div
              style={{
                color: '#9195A6',
                fontSize: '12px',
                fontFamily: 'Inter',
              }}
            >
              {borrowAmount.main}
              <span style={{ color: '#C2C5D0' }}>
                {borrowAmount.secondary}
              </span>{' '}
              {p.borrowAsset.metadata.symbol.replace('_DEMO', '')} ·{' '}
              {(p.borrowApy * 100).toFixed(2)}% APY · Coll{' '}
              {p.collateralAsset.metadata.symbol.replace('_DEMO', '')} $
              {collateralAmount.main}
              <span style={{ color: '#C2C5D0' }}>
                {collateralAmount.secondary}
              </span>
            </div>
          </div>
        )
      })}
    </>
  )
}
