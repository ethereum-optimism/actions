import type { Address } from 'viem'

import type {
  BorrowMarketId,
  BorrowQuote,
  ClosePositionParams,
  DepositCollateralParams,
  GetBorrowMarketsParams,
  GetBorrowPriceParams,
  GetBorrowQuoteParams,
  OpenPositionParams,
  RepayParams,
  WithdrawCollateralParams,
} from '@/types/borrow-sdk-stubs.js'

/**
 * Service-layer parameter types for the demo backend's borrow surface.
 * Each mutation accepts either fresh params (from a validated request body)
 * or a pre-built `BorrowQuote` (recipient-bound calldata per PR #3 Decision 6).
 *
 * When PR #3 lands, the SDK exports its own param types and these can
 * derive from `Parameters<...>[0]` to track drift automatically.
 */

export type BorrowOpenServiceParams =
  | ({ idToken: string } & OpenPositionParams)
  | { idToken: string; quote: BorrowQuote }

export type BorrowCloseServiceParams =
  | ({ idToken: string } & ClosePositionParams)
  | { idToken: string; quote: BorrowQuote }

export type BorrowDepositCollateralServiceParams =
  | ({ idToken: string } & DepositCollateralParams)
  | { idToken: string; quote: BorrowQuote }

export type BorrowWithdrawCollateralServiceParams =
  | ({ idToken: string } & WithdrawCollateralParams)
  | { idToken: string; quote: BorrowQuote }

export type BorrowRepayServiceParams =
  | ({ idToken: string } & RepayParams)
  | { idToken: string; quote: BorrowQuote }

/**
 * Read-side service params. Markets / price / quote / position are not
 * authenticated at the service layer; auth happens at the controller
 * boundary and is encoded as `walletAddress` for `getPosition` and
 * `recipient` for `getQuote`.
 */

export type BorrowMarketsServiceParams = GetBorrowMarketsParams

export type BorrowPriceServiceParams = GetBorrowPriceParams

export type BorrowQuoteServiceParams = GetBorrowQuoteParams

export interface BorrowPositionServiceParams {
  marketId: BorrowMarketId
  walletAddress: Address
}
