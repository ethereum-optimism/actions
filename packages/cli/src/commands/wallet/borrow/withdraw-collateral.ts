import { CliError } from '@/output/errors.js'
import { parseAmount } from '@/utils/parseAmount.js'

import { runBorrowAction } from './runBorrowAction.js'

export interface BorrowWithdrawCollateralFlags {
  market: string
  amount?: string
  max?: boolean
}

/**
 * @description Handler for `actions wallet borrow withdraw-collateral --market <name> (--amount <n> | --max)`. Pulls collateral back to the wallet. `--max` resolves to the live collateral balance at dispatch time so dust from interest accrual is not left behind. The CLI enforces the xor at runtime because commander hands the handler a loosely-typed object.
 * @param flags - Commander-parsed options.
 * @throws `CliError` with code `validation` when both `--amount` and `--max` are set or when neither is.
 */
export async function runWalletBorrowWithdrawCollateral(
  flags: BorrowWithdrawCollateralFlags,
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
  await runBorrowAction({
    action: 'withdrawCollateral',
    marketName: flags.market,
    buildAndDispatch: async (wallet, market) =>
      wallet.borrow.withdrawCollateral({
        market,
        amount: isMax ? { max: true } : { amount: amount as number },
      }),
    envelopeAmounts: { collateralAmount: isMax ? 'max' : amount },
  })
}
