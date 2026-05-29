/**
 * Serialization helpers for the borrow API boundary.
 *
 * `buildQuoteBody` shapes the discriminated quote body the backend
 * expects. `deserialize*` helpers parse the decimal-string bigints the
 * backend ships back into native `bigint` so the rest of the frontend
 * never deals with the wire shape. `marketIdPath` and `isEmptyPosition`
 * are small URL / null-sentinel utilities used by the client.
 */

import type {
  BorrowMarket,
  BorrowMarketId,
  BorrowMarketPosition,
  BorrowQuote,
  BorrowReceipt,
} from '@eth-optimism/actions-sdk'

import type { Serialized } from '../util/serialize.js'
import type { BorrowQuoteParams } from './borrowApi.types.js'

export function buildQuoteBody(
  params: BorrowQuoteParams,
): Record<string, unknown> {
  const base = {
    action: params.action,
    marketId: params.marketId,
  }
  switch (params.action) {
    case 'open':
    case 'close':
      return {
        ...base,
        borrowAmount: params.borrowAmount,
        ...(params.collateralAmount
          ? { collateralAmount: params.collateralAmount }
          : {}),
      }
    case 'depositCollateral':
    case 'withdrawCollateral':
    case 'repay':
      return { ...base, amount: params.amount }
  }
}

export function deserializeMarket(m: Serialized<BorrowMarket>): BorrowMarket {
  return {
    ...m,
    totalBorrowed: BigInt(m.totalBorrowed as unknown as string),
    totalCollateral: BigInt(m.totalCollateral as unknown as string),
  } as BorrowMarket
}

export function deserializePosition(
  p: Serialized<BorrowMarketPosition>,
): BorrowMarketPosition {
  return {
    ...p,
    collateralShares: BigInt(p.collateralShares as unknown as string),
    collateralAmount: BigInt(p.collateralAmount as unknown as string),
    borrowAmount: BigInt(p.borrowAmount as unknown as string),
    liquidationPrice: BigInt(p.liquidationPrice as unknown as string),
  } as BorrowMarketPosition
}

export function deserializeQuote(q: Serialized<BorrowQuote>): BorrowQuote {
  const positionBefore = q.positionBefore
    ? deserializePosition(
        q.positionBefore as unknown as Serialized<BorrowMarketPosition>,
      )
    : null
  const positionAfter = deserializePosition(
    q.positionAfter as unknown as Serialized<BorrowMarketPosition>,
  )
  return {
    ...q,
    positionBefore,
    positionAfter,
    borrowAmountRaw:
      q.borrowAmountRaw !== undefined && q.borrowAmountRaw !== null
        ? BigInt(q.borrowAmountRaw as unknown as string)
        : undefined,
    collateralAmountRaw:
      q.collateralAmountRaw !== undefined && q.collateralAmountRaw !== null
        ? BigInt(q.collateralAmountRaw as unknown as string)
        : undefined,
    gasEstimate:
      q.gasEstimate !== undefined && q.gasEstimate !== null
        ? BigInt(q.gasEstimate as unknown as string)
        : undefined,
  } as BorrowQuote
}

export function deserializeReceipt(
  r: Serialized<BorrowReceipt>,
): BorrowReceipt {
  return {
    ...r,
    borrowAmount:
      r.borrowAmount !== undefined && r.borrowAmount !== null
        ? BigInt(r.borrowAmount as unknown as string)
        : undefined,
    collateralAmount:
      r.collateralAmount !== undefined && r.collateralAmount !== null
        ? BigInt(r.collateralAmount as unknown as string)
        : undefined,
    positionAfter: r.positionAfter
      ? deserializePosition(
          r.positionAfter as unknown as Serialized<BorrowMarketPosition>,
        )
      : undefined,
  } as BorrowReceipt
}

export function marketIdPath(marketId: BorrowMarketId): string {
  if (marketId.kind === 'morpho-blue') {
    return `${marketId.chainId}/${encodeURIComponent(marketId.marketId)}`
  }
  throw new Error(`Unsupported borrow marketId.kind: ${marketId.kind}`)
}

/**
 * The backend always responds 200 to a position read and returns
 * collateral=0, debt=0 when the wallet has no position. The frontend
 * expects `null` in that case so empty positions don't render.
 */
export function isEmptyPosition(p: BorrowMarketPosition): boolean {
  return p.collateralAmount === 0n && p.borrowAmount === 0n
}
