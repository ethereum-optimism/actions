import type { Address } from 'viem'

import type { ApprovalMode } from '@/types/actions.js'
import type { BorrowMarketConfig } from '@/types/borrow/market.js'
import type { TransactionOptions } from '@/types/common/index.js'

/**
 * Internal amount representation after the base normalizes user input.
 * @description `{ max: true }` is preserved through to the provider so it
 * can re-fetch live balance at bundle-build time and avoid dust.
 */
export type AmountWeiOrMax = { amountWei: bigint } | { max: true }

/**
 * Base shape for internal params handed to provider `_*` hooks.
 * @description Approval mode is resolved by the abstract base; concrete
 * providers route any on-chain receiver argument to `walletAddress` until
 * borrow-on-behalf-of is supported.
 */
export interface BorrowInternalBaseParams {
  market: BorrowMarketConfig
  walletAddress: Address
  options?: TransactionOptions
  /** Resolved approval-amount strategy (per-call → provider → settings → `"exact"`). */
  approvalMode: ApprovalMode
}

/** Internal params after `openPosition` amount normalization. */
export interface BorrowOpenPositionInternalParams extends BorrowInternalBaseParams {
  borrowAmountWei: bigint
  collateralAmountWei?: bigint
}

/** Internal params after `closePosition` amount normalization. */
export interface BorrowClosePositionInternalParams extends BorrowInternalBaseParams {
  borrowAmount: AmountWeiOrMax
  collateralAmount?: AmountWeiOrMax
}

/** Internal params after `depositCollateral` amount normalization. */
export interface BorrowDepositCollateralInternalParams extends BorrowInternalBaseParams {
  amount: AmountWeiOrMax
}

/** Internal params after `withdrawCollateral` amount normalization. */
export interface BorrowWithdrawCollateralInternalParams extends BorrowInternalBaseParams {
  amount: AmountWeiOrMax
}

/** Internal params after `repay` amount normalization. */
export interface BorrowRepayInternalParams extends BorrowInternalBaseParams {
  amount: AmountWeiOrMax
}

/**
 * Provider-level borrow configuration.
 * @description Mirrors `LendProviderConfig`. Provider-level fields override
 * the shared `BorrowSettings`; per-call params override the provider.
 */
export interface BorrowProviderConfig {
  /** Allowlist of markets available through this provider */
  marketAllowlist?: BorrowMarketConfig[]
  /** Blocklist of markets to exclude */
  marketBlocklist?: BorrowMarketConfig[]
  /** Approval-amount strategy override (overrides `BorrowSettings.approvalMode`) */
  approvalMode?: ApprovalMode
  /** Quote expiration in seconds (overrides `BorrowSettings.quoteExpirationSeconds`) */
  quoteExpirationSeconds?: number
}
