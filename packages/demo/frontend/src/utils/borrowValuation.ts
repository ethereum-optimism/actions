/**
 * USD valuation helpers for the Borrow tab.
 *
 * Derive display-only USD aggregates from SDK position objects using the
 * local stub price table. Kept out of `borrowMath.ts`, which stays
 * price-source agnostic.
 */

import { stubPriceUsd } from '@/utils/stubPrices' // retired by #482
import type { BorrowPosition, MarketPosition } from '@/types/market'

export interface PositionUsd {
  collateralValueUsd: number
  borrowValueUsd: number
}

export function positionUsd(position: BorrowPosition | null): PositionUsd {
  if (!position) return { collateralValueUsd: 0, borrowValueUsd: 0 }
  const collPrice = stubPriceUsd(position.collateralAsset.metadata.symbol)
  const borrPrice = stubPriceUsd(position.borrowAsset.metadata.symbol)
  return {
    collateralValueUsd:
      parseFloat(position.collateralAmountFormatted || '0') * collPrice,
    borrowValueUsd:
      parseFloat(position.borrowAmountFormatted || '0') * borrPrice,
  }
}

export function lendPositionUsd(position: MarketPosition): number {
  const price = stubPriceUsd(position.asset.metadata.symbol)
  return parseFloat(position.depositedAmount || '0') * price
}

export function directLendPositionUsd(position: MarketPosition): number {
  const price = stubPriceUsd(position.asset.metadata.symbol)
  return parseFloat(position.directDepositedAmount || '0') * price
}
