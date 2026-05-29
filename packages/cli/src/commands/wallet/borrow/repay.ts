import {
  amountOrMaxToEnvelope,
  parseApprovalMode,
  resolveAmountOrMax,
  runBorrowAction,
} from './runBorrowAction.js'

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
  const amount = resolveAmountOrMax(
    {
      amountFlag: '--amount',
      maxFlag: '--max',
      raw: flags.amount,
      isMax: flags.max === true,
    },
    true,
  )
  const approvalMode = parseApprovalMode(flags.approvalMode)
  await runBorrowAction({
    action: 'repay',
    marketName: flags.market,
    buildAndDispatch: async (wallet, market) =>
      wallet.borrow.repay({ market, amount, approvalMode }),
    envelopeAmounts: { borrowAmount: amountOrMaxToEnvelope(amount) },
  })
}
