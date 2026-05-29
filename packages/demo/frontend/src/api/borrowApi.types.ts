/**
 * Param shapes for `borrowApi` calls. Reference markets by `BorrowMarketId`;
 * the backend resolves the full `BorrowMarketConfig` server-side.
 */

import type {
  Amount,
  AmountOrMax,
  BorrowMarketId,
} from '@eth-optimism/actions-sdk'

export interface StubOpenParams {
  marketId: BorrowMarketId
  borrowAmount: Amount
  collateralAmount?: Amount
}

export interface StubCloseParams {
  marketId: BorrowMarketId
  borrowAmount: AmountOrMax
  collateralAmount?: AmountOrMax
}

export interface StubCollateralParams {
  marketId: BorrowMarketId
  amount: AmountOrMax
}

export interface StubRepayParams {
  marketId: BorrowMarketId
  amount: AmountOrMax
}

/**
 * Discriminated quote params matching the backend's `QuoteBodySchema`.
 * `walletAddress` is rejected by `/borrow/quote` (derived from auth).
 */
export type BorrowQuoteParams =
  | {
      action: 'open'
      marketId: BorrowMarketId
      borrowAmount: Amount
      collateralAmount?: Amount
    }
  | {
      action: 'close'
      marketId: BorrowMarketId
      borrowAmount: AmountOrMax
      collateralAmount?: AmountOrMax
    }
  | {
      action: 'depositCollateral'
      marketId: BorrowMarketId
      amount: Amount
    }
  | {
      action: 'withdrawCollateral'
      marketId: BorrowMarketId
      amount: AmountOrMax
    }
  | {
      action: 'repay'
      marketId: BorrowMarketId
      amount: AmountOrMax
    }
