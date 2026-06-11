import type { Address } from 'viem'

import type { BorrowProviderName } from '@/types/actions.js'
import type {
  BorrowAction,
  BorrowMarketPosition,
  BorrowQuote,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

export interface AssembleBorrowQuoteArgs {
  provider: BorrowProviderName
  action: BorrowAction
  recipient: Address
  /** Converted position before the action, or `null` for a fresh open. */
  positionBefore: BorrowMarketPosition | null
  /** Converted position after the action lands on-chain. */
  positionAfter: BorrowMarketPosition
  quoteAmounts: { borrowAmountRaw?: bigint; collateralAmountRaw?: bigint }
  transactions: TransactionData[]
  approvalsSkipped: boolean
  healthBufferPct: number
  quoteExpirationSeconds: number
}

/**
 * Assemble the provider-agnostic `BorrowQuote` envelope from already-converted
 * positions. `marketId`, `fees`, and `safeCeilingLtv` all derive from
 * `positionAfter`, so each provider owns only its native →
 * `BorrowMarketPosition` conversion (and the `hasBefore` test on its own state
 * shape); this owns the shared envelope.
 */
export function assembleBorrowQuote(
  args: AssembleBorrowQuoteArgs,
): BorrowQuote {
  const now = Math.floor(Date.now() / 1000)
  return {
    marketId: args.positionAfter.marketId,
    recipient: args.recipient,
    action: args.action,
    borrowAmountRaw: args.quoteAmounts.borrowAmountRaw,
    collateralAmountRaw: args.quoteAmounts.collateralAmountRaw,
    positionBefore: args.positionBefore,
    positionAfter: args.positionAfter,
    fees: {
      borrowApy: args.positionAfter.borrowApy,
      liquidationBonus: args.positionAfter.liquidationBonus,
    },
    safeCeilingLtv: args.positionAfter.maxLtv * (1 - args.healthBufferPct),
    execution: {
      transactions: args.transactions,
      approvalsSkipped: args.approvalsSkipped,
    },
    provider: args.provider,
    quotedAt: now,
    expiresAt: now + args.quoteExpirationSeconds,
  }
}
