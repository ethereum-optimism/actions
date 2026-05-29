import { parseAmount } from '@/utils/parseAmount.js'

import { parseApprovalMode, runBorrowAction } from './runBorrowAction.js'

export interface BorrowOpenFlags {
  market: string
  borrowAmount: string
  collateralAmount?: string
  /** Optional override of the wallet-level approval-amount strategy. */
  approvalMode?: string
}

/**
 * @description Handler for `actions wallet borrow open --market <name> --borrow-amount <n> [--collateral-amount <n>] [--approval-mode <exact|max>]`. Borrowing without simultaneously depositing collateral is supported (`--collateral-amount` omitted) when the caller already has collateral on the position. No `--max` flag here: the open path only accepts the strict `Amount` shape on either leg.
 * @param flags - Commander-parsed required options.
 */
export async function runWalletBorrowOpen(
  flags: BorrowOpenFlags,
): Promise<void> {
  const borrowAmount = parseAmount(flags.borrowAmount, '--borrow-amount')
  const collateralAmount =
    flags.collateralAmount !== undefined
      ? parseAmount(flags.collateralAmount, '--collateral-amount')
      : undefined
  const approvalMode = parseApprovalMode(flags.approvalMode)
  await runBorrowAction({
    action: 'open',
    marketName: flags.market,
    buildAndDispatch: async (wallet, market) =>
      wallet.borrow.openPosition({
        market,
        borrowAmount: { amount: borrowAmount },
        collateralAmount:
          collateralAmount !== undefined
            ? { amount: collateralAmount }
            : undefined,
        approvalMode,
      }),
    envelopeAmounts: {
      borrowAmount,
      collateralAmount,
    },
  })
}
