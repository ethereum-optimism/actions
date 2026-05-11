/**
 * Borrow-tab types for the demo frontend.
 *
 * Shapes mirror PR #3's locked SDK contract
 * (origin/kevin/borrow-pr3:docs/brainstorms/2026-05-08-borrow-pr3-sdk-borrow-provider-brainstorm.md).
 * When PR #3 lands, these become straight re-exports from
 * `@eth-optimism/actions-sdk`. Until then they live here so the demo
 * frontend can compile against a stable contract.
 */

import type { Asset, SupportedChainId } from '@eth-optimism/actions-sdk'
import type { Address, Hex } from 'viem'

// ---------- Market identity ----------

/**
 * Tagged union per PR #3 Decision 4a (forward-compat for Aave / Comet /
 * Liquity / Euler). PR #5 ships only the Morpho variant.
 */
export type BorrowMarketId = {
  kind: 'morpho-blue'
  marketId: Hex
  chainId: SupportedChainId
}

/** Distinguishable from {@link BorrowMarketId} by sitting alongside it as
 * a denormalized config blob (Asset metadata, provider names, optional
 * per-market buffer override). */
export type BorrowMarketConfig = BorrowMarketId & {
  name: string
  collateralAsset: Asset
  borrowAsset: Asset
  borrowProvider: 'morpho' | 'aave'
  lendProvider: 'morpho' | 'aave'
  healthBufferPct?: number
}

// ---------- Amount discriminated unions (PR #3 Decision 3 / #379) ----------

export type AmountExact = { amount: number } | { amountRaw: bigint }

export type AmountWithMax = AmountExact | { max: true }

// ---------- Market and position ----------

export interface BorrowMarket {
  marketId: BorrowMarketId
  name: string
  collateralAsset: Asset
  borrowAsset: Asset
  liquidity: {
    amount: bigint
    amountFormatted: string
  }
  borrowApy: number
  maxLtv: number
  liquidationBonus: number
  borrowProvider: 'morpho' | 'aave'
  lendProvider: 'morpho' | 'aave'
  healthBufferPct?: number
}

export interface BorrowMarketPosition {
  marketId: BorrowMarketId
  collateralAsset: Asset
  collateralAmount: bigint
  collateralAmountFormatted: string
  borrowAsset: Asset
  borrowAmount: bigint
  borrowAmountFormatted: string
  /** Aave-style: 1.0 = liquidation; Infinity if no debt is open. */
  healthFactor: number
  liquidationPrice: bigint
  liquidationPriceFormatted: string
  borrowApy: number
  liquidationBonus: number
  ltv?: number
  maxLtv?: number
}

// ---------- Quote and price (PR #3 Decision 6) ----------

export type BorrowAction =
  | 'open'
  | 'close'
  | 'depositCollateral'
  | 'withdrawCollateral'
  | 'repay'

export interface BorrowFees {
  borrowApy: number
  liquidationBonus: number
  originationFee?: {
    amount: number
    amountRaw: bigint
    asset: Asset
    description: string
  }
}

export interface BorrowPrice {
  marketId: BorrowMarketId
  action: BorrowAction
  positionAfter: BorrowMarketPosition
  fees: BorrowFees
  /** SDK-precomputed: `maxLtv * (1 - healthBufferPct)`. */
  safeCeilingLtv: number
}

/** Read shape of a transaction bundle item. PR #3 / PR #4 will produce
 * concrete `{ to, data, value }` tuples; for PR #5 stub we model just
 * enough for type safety. */
export interface BorrowTxRequest {
  to: Address
  data: Hex
  value: bigint
}

export interface BorrowQuote {
  marketId: BorrowMarketId
  action: BorrowAction

  borrowAmount?: number
  borrowAmountRaw?: bigint
  collateralAmount?: number
  collateralAmountRaw?: bigint

  positionBefore: BorrowMarketPosition | null
  positionAfter: BorrowMarketPosition

  fees: BorrowFees
  safeCeilingLtv: number

  execution: { transactions: BorrowTxRequest[] }

  provider: 'morpho' | 'aave'
  recipient: Address
  quotedAt: number
  expiresAt: number
  gasEstimate?: bigint
}

// ---------- Execute params and receipts ----------

export interface BorrowOpenParams {
  marketId: BorrowMarketId
  borrowAmount: AmountExact
  collateralAmount?: AmountExact
  collateralAsset?: Address
}

export interface BorrowCloseParams {
  marketId: BorrowMarketId
  borrowAmount: AmountWithMax
  collateralAmount?: AmountWithMax
}

export interface BorrowCollateralParams {
  marketId: BorrowMarketId
  amount: AmountWithMax
}

export interface BorrowRepayParams {
  marketId: BorrowMarketId
  amount: AmountWithMax
}

export type BorrowExecuteParams =
  | { action: 'open'; params: BorrowOpenParams }
  | { action: 'close'; params: BorrowCloseParams }
  | { action: 'depositCollateral'; params: BorrowCollateralParams }
  | { action: 'withdrawCollateral'; params: BorrowCollateralParams }
  | { action: 'repay'; params: BorrowRepayParams }
  // PR #3 Decision 6: wallet methods accept either fresh params or a
  // pre-built BorrowQuote. PR #5 stub mirrors but only uses the params
  // branch internally.
  | { action: BorrowAction; quote: BorrowQuote }

export type BorrowTransactionReceipt =
  | {
      status: 'success'
      transactionHash: string
      blockExplorerUrl?: string
    }
  | { status: 'pending' }

// ---------- Markets-list query ----------

export interface GetBorrowMarketsParams {
  collateralAsset?: Asset
  borrowAsset?: Asset
  chainId?: SupportedChainId
}
