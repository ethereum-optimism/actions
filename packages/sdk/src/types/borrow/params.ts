import type { Address } from 'viem'

import type { ApprovalMode } from '@/types/actions.js'
import type { BorrowMarketConfig } from '@/types/borrow/market.js'
import type { TransactionOptions } from '@/types/common/index.js'

/**
 * Amount input variant (#379 convention).
 * @description Exactly one of `amount` (human-readable) or `amountRaw`
 * (wei bigint) must be provided.
 */
export type Amount = { amount: number } | { amountRaw: bigint }

/**
 * Amount input variant that may opt into the protocol's full-balance path.
 * @description `{ max: true }` resolves at dispatch time to the live
 * on-chain balance; this avoids dust left behind by interest accrual on
 * full repays / closes.
 */
export type AmountOrMax = Amount | { max: true }

/**
 * Shared base for every borrow action's public params.
 * @description Concrete action params extend this with their amount fields.
 */
export interface BorrowOpenPositionBaseParams {
  /** Market to operate against */
  market: BorrowMarketConfig
  /**
   * Wallet performing the action. Auto-injected by `WalletBorrowNamespace`;
   * required when calling the base provider directly.
   */
  walletAddress?: Address
  /** Optional per-call transaction-level overrides */
  options?: TransactionOptions
  /**
   * Override the wallet-level approval-amount strategy for this call.
   * Falls back to `BorrowSettings.approvalMode` and finally to `"exact"`.
   */
  approvalMode?: ApprovalMode
}

/**
 * Params for opening or topping up a borrow position.
 * @description `borrowAmount` is required (the loan side of the action);
 * `collateralAmount` is optional, allowing a user to borrow against
 * previously deposited collateral.
 */
export type BorrowOpenPositionParams = BorrowOpenPositionBaseParams & {
  /** Amount to borrow from the market */
  borrowAmount: Amount
  /** Collateral to deposit alongside the borrow */
  collateralAmount?: Amount
}

/**
 * Params for unwinding a borrow position.
 * @description Symmetric inverse of `openPosition`. Both amounts accept
 * `{ max: true }` for dust-free full close.
 */
export type BorrowClosePositionParams = BorrowOpenPositionBaseParams & {
  /** Debt to repay; pass `{ max: true }` for a full repay */
  borrowAmount: AmountOrMax
  /** Collateral to withdraw; omit to leave collateral on the position */
  collateralAmount?: AmountOrMax
}

/** Params for depositing additional collateral without changing debt. */
export type BorrowDepositCollateralParams = BorrowOpenPositionBaseParams & {
  amount: AmountOrMax
}

/** Params for withdrawing collateral. `{ max: true }` withdraws the full balance. */
export type BorrowWithdrawCollateralParams = BorrowOpenPositionBaseParams & {
  amount: AmountOrMax
}

/** Params for repaying debt without touching collateral. */
export type BorrowRepayParams = BorrowOpenPositionBaseParams & {
  amount: AmountOrMax
}

/**
 * Discriminator for the action a quote / receipt represents.
 */
export type BorrowAction =
  | 'open'
  | 'close'
  | 'depositCollateral'
  | 'withdrawCollateral'
  | 'repay'

/**
 * Discriminated union of all params accepted by `actions.borrow.getQuote`.
 * The leading `action` field selects which variant applies; the rest of the
 * shape matches the corresponding wallet method's params.
 */
export type BorrowQuoteParams =
  | ({ action: 'open' } & BorrowOpenPositionParams)
  | ({ action: 'close' } & BorrowClosePositionParams)
  | ({ action: 'depositCollateral' } & BorrowDepositCollateralParams)
  | ({ action: 'withdrawCollateral' } & BorrowWithdrawCollateralParams)
  | ({ action: 'repay' } & BorrowRepayParams)
