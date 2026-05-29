import type { AmountOrMax } from '@eth-optimism/actions-sdk'

import { CliError } from '@/output/errors.js'
import { parseAmount } from '@/utils/parseAmount.js'

import { runBorrowAction } from './runBorrowAction.js'

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
  const borrowAmount = resolveLeg(
    'borrow',
    flags.borrowAmount,
    flags.borrowMax === true,
    true,
  )
  const collateralAmount = resolveLeg(
    'collateral',
    flags.collateralAmount,
    flags.collateralMax === true,
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
      borrowAmount: envelopeFor(borrowAmount),
      collateralAmount: envelopeFor(collateralAmount),
    },
  })
}

function resolveLeg(
  leg: 'borrow' | 'collateral',
  raw: string | undefined,
  isMax: boolean,
  required: true,
): AmountOrMax
function resolveLeg(
  leg: 'borrow' | 'collateral',
  raw: string | undefined,
  isMax: boolean,
  required: false,
): AmountOrMax | undefined
function resolveLeg(
  leg: 'borrow' | 'collateral',
  raw: string | undefined,
  isMax: boolean,
  required: boolean,
): AmountOrMax | undefined {
  const amountFlag = `--${leg}-amount`
  const maxFlag = `--${leg}-max`
  if (raw !== undefined && isMax) {
    throw new CliError(
      'validation',
      `Pass either ${amountFlag} or ${maxFlag}, not both`,
      { leg, [amountFlag.slice(2)]: raw, [maxFlag.slice(2)]: true },
    )
  }
  if (isMax) return { max: true }
  if (raw !== undefined) return { amount: parseAmount(raw, amountFlag) }
  if (required) {
    throw new CliError(
      'validation',
      `Either ${amountFlag} or ${maxFlag} is required`,
      { leg },
    )
  }
  return undefined
}

function envelopeFor(
  value: AmountOrMax | undefined,
): number | 'max' | undefined {
  if (value === undefined) return undefined
  if ('max' in value) return 'max'
  if ('amount' in value) return value.amount
  return undefined
}
