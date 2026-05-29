import {
  amountOrMaxToEnvelope,
  resolveAmountOrMax,
  runBorrowAction,
} from './runBorrowAction.js'

export interface BorrowWithdrawCollateralFlags {
  market: string
  amount?: string
  max?: boolean
}

/**
 * @description Handler for `actions wallet borrow withdraw-collateral --market <name> (--amount <n> | --max)`. Pulls collateral back to the wallet. `--max` resolves to the live collateral balance at dispatch time so dust from interest accrual is not left behind. Mutex enforcement happens inside `resolveAmountOrMax`.
 * @param flags - Commander-parsed options.
 * @throws `CliError` with code `validation` when both `--amount` and `--max` are set or when neither is.
 */
export async function runWalletBorrowWithdrawCollateral(
  flags: BorrowWithdrawCollateralFlags,
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
  await runBorrowAction({
    action: 'withdrawCollateral',
    marketName: flags.market,
    buildAndDispatch: async (wallet, market) =>
      wallet.borrow.withdrawCollateral({ market, amount }),
    envelopeAmounts: { collateralAmount: amountOrMaxToEnvelope(amount) },
  })
}
