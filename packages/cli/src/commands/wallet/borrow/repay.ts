import { CliError } from '@/output/errors.js'
import { parseAmount } from '@/utils/parseAmount.js'

import { parseApprovalMode, runBorrowAction } from './runBorrowAction.js'

export interface BorrowRepayFlags {
  market: string
  amount?: string
  max?: boolean
  /** Optional override of the wallet-level approval-amount strategy. */
  approvalMode?: string
}

/**
 * @description Handler for `actions wallet borrow repay --market <name> (--amount <n> | --max) [--approval-mode <exact|max>]`. Repays debt without touching collateral. `--max` resolves to the wallet's outstanding debt at dispatch time, avoiding the dust that strict-amount repays leave behind when interest accrues between quote and submit.
 * @param flags - Commander-parsed options.
 * @throws `CliError` with code `validation` when both `--amount` and `--max` are set or when neither is.
 */
export async function runWalletBorrowRepay(
  flags: BorrowRepayFlags,
): Promise<void> {
  const isMax = flags.max === true
  if (isMax && flags.amount !== undefined) {
    throw new CliError(
      'validation',
      'Pass either --amount or --max, not both',
      { amount: flags.amount, max: true },
    )
  }
  if (!isMax && flags.amount === undefined) {
    throw new CliError('validation', 'Either --amount or --max is required')
  }
  const amount = isMax ? undefined : parseAmount(flags.amount as string)
  const approvalMode = parseApprovalMode(flags.approvalMode)
  await runBorrowAction({
    action: 'repay',
    marketName: flags.market,
    buildAndDispatch: async (wallet, market) =>
      wallet.borrow.repay({
        market,
        amount: isMax ? { max: true } : { amount: amount as number },
        approvalMode,
      }),
    envelopeAmounts: { borrowAmount: isMax ? 'max' : amount },
  })
}
