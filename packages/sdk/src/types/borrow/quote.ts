import type { Address, Hex } from 'viem'

import type { BorrowProviderName } from '@/types/actions.js'
import type {
  BorrowMarketId,
  BorrowMarketPosition,
} from '@/types/borrow/market.js'
import type { BorrowAction } from '@/types/borrow/params.js'
import type { TransactionData } from '@/types/transaction.js'
import type {
  BatchTransactionReturnType,
  TransactionReturnType,
} from '@/wallet/core/wallets/abstract/types/index.js'

/**
 * Fee context for a borrow action.
 * @description Required fields apply to every protocol PR #3 ships. The
 * forward-looking `originationFee` slot has been dropped per YAGNI; it
 * will be reintroduced when a protocol that charges upfront fees ships
 * (e.g. Liquity).
 */
export interface BorrowFees {
  /** Current borrow APY as a decimal (e.g. 0.045 = 4.5%) */
  borrowApy: number
  /** Liquidator discount as a decimal (e.g. 0.05 = 5%) */
  liquidationBonus: number
}

/**
 * Pre-built calldata bundle attached to a borrow quote.
 */
export interface BorrowQuoteExecution {
  /**
   * Ordered transaction bundle (`[approve?, collateral?, primary]`). Marked
   * `readonly` so consumers can't mutate a frozen quote.
   */
  transactions: readonly TransactionData[]
  /**
   * `true` when existing on-chain allowance covered the bundle and no
   * approval transaction was prepended.
   */
  approvalsSkipped?: boolean
}

/**
 * A complete borrow quote: position transitions, fees, safe-ceiling LTV,
 * and a pre-built transaction bundle ready to submit on-chain.
 * @description Pass the quote back into the matching `wallet.borrow.*`
 * method to dispatch without re-quoting.
 */
export interface BorrowQuote {
  /** Market the quote targets */
  marketId: BorrowMarketId
  /** Action the quote represents */
  action: BorrowAction
  /** Echo of the borrow-side input amount (display) */
  borrowAmount?: number
  /** Echo of the borrow-side input amount (raw) */
  borrowAmountRaw?: bigint
  /** Echo of the collateral-side input amount (display) */
  collateralAmount?: number
  /** Echo of the collateral-side input amount (raw) */
  collateralAmountRaw?: bigint
  /**
   * Position state immediately before the action. `null` when opening
   * a fresh position.
   */
  positionBefore: BorrowMarketPosition | null
  /** Position state after the action lands on-chain */
  positionAfter: BorrowMarketPosition
  /** Fee context at quote time */
  fees: BorrowFees
  /**
   * Buffer-aware safe ceiling (`maxLtv * (1 - healthBufferPct)`).
   * UX recommendation only; consumers gate explicitly by checking
   * `positionAfter.ltv > safeCeilingLtv`.
   */
  safeCeilingLtv: number
  /** Pre-built transaction bundle */
  execution: BorrowQuoteExecution
  /** Provider that produced the quote */
  provider: BorrowProviderName
  /**
   * Recipient baked into the quote's calldata. `WalletBorrowNamespace`
   * binds this to `wallet.address`; mismatched executors must re-quote.
   */
  recipient: Address
  /** Unix seconds when the quote was generated */
  quotedAt: number
  /** Unix seconds when the quote expires */
  expiresAt: number
  /** Optional gas estimate for the bundle (raw wei) */
  gasEstimate?: bigint
}

/**
 * Receipt returned after dispatching a borrow action.
 * @description Denormalizes the underlying receipt's identifying hash(es)
 * onto the envelope so consumers can build block-explorer URLs without
 * downcasting the `receipt` union: `transactionHash` for single EOA tx,
 * `transactionHashes` for batched EOA, `userOpHash` for ERC-4337.
 */
export interface BorrowReceipt {
  /** Underlying transaction receipt(s) */
  receipt: TransactionReturnType | BatchTransactionReturnType
  /** Action that was executed */
  action: BorrowAction
  /** Realized borrow-side amount in wei */
  borrowAmount?: bigint
  /** Realized collateral-side amount in wei */
  collateralAmount?: bigint
  /** Market the receipt corresponds to */
  marketId: BorrowMarketId
  /** Position snapshot taken after the action lands, when available */
  positionAfter?: BorrowMarketPosition
  /** Single EOA transaction hash (set when dispatch ran one tx) */
  transactionHash?: Hex
  /** Batched EOA transaction hashes (set when dispatch ran multiple txs) */
  transactionHashes?: Hex[]
  /** UserOperation hash (set when dispatch ran through ERC-4337) */
  userOpHash?: Hex
}
