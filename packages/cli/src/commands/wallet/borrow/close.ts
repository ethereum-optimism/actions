import {
  amountOrMaxToEnvelope,
  resolveAmountOrMax,
  runBorrowAction,
} from './runBorrowAction.js'

/**
 * @description Loose argv shape for `actions wallet borrow close`. Commander hands the handler a plain object with no per-flag mutual exclusivity enforced, so the field types here mirror what commander produces and the runtime guards in `runWalletBorrowClose` translate that into the strict `AmountOrMax` per leg.
 */
export interface BorrowCloseFlags {
  market: string
  borrowAmount?: string
  borrowMax?: boolean
  collateralAmount?: string
  collateralMax?: boolean
}

/**
 * @description Handler for `actions wallet borrow close --market <name> [--borrow-amount <n> | --borrow-max] [--collateral-amount <n> | --collateral-max]`. The borrow leg is required by the SDK type (`AmountOrMax`); the collateral leg is optional. Each leg is internally xor (you may pass at most one of `--<leg>-amount` / `--<leg>-max`). `--*-max` resolves to the SDK's full-balance path at dispatch time, avoiding dust left behind by interest accrual.
 * @param flags - Commander-parsed options.
 * @throws `CliError` with code `validation` when both `*-amount` and `*-max` are set on the same leg, or when the borrow leg is missing.
 */
export async function runWalletBorrowClose(
  flags: BorrowCloseFlags,
): Promise<void> {
  const borrowAmount = resolveAmountOrMax(
    {
      amountFlag: '--borrow-amount',
      maxFlag: '--borrow-max',
      raw: flags.borrowAmount,
      isMax: flags.borrowMax === true,
    },
    true,
  )
  const collateralAmount = resolveAmountOrMax(
    {
      amountFlag: '--collateral-amount',
      maxFlag: '--collateral-max',
      raw: flags.collateralAmount,
      isMax: flags.collateralMax === true,
    },
    false,
  )
  await runBorrowAction({
    action: 'close',
    marketName: flags.market,
    buildAndDispatch: async (wallet, market) =>
      wallet.borrow.closePosition({
        market,
        borrowAmount,
        collateralAmount,
      }),
    envelopeAmounts: {
      borrowAmount: amountOrMaxToEnvelope(borrowAmount),
      collateralAmount: amountOrMaxToEnvelope(collateralAmount),
    },
  })
}
