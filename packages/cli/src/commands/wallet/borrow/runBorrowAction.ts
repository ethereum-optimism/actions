import {
  type AmountOrMax,
  type BorrowAction,
  type BorrowMarketConfig,
  borrowProviderForKind,
  type BorrowReceipt,
  type Wallet,
} from '@eth-optimism/actions-sdk'

import { walletContext } from '@/context/walletContext.js'
import { CliError, rethrowAsCliError } from '@/output/errors.js'
import {
  type BorrowEnvelopeAmounts,
  printOutput,
} from '@/output/printOutput.js'
import {
  configuredBorrowMarkets,
  resolveBorrowMarket,
} from '@/resolvers/borrowMarkets.js'
import { parseAmount } from '@/utils/parseAmount.js'
import { ensureOnchainSuccess, toReceiptArray } from '@/utils/receipts.js'

import { requireBorrowCapability } from './requireBorrowCapability.js'

type WalletWithBorrow = Wallet & { borrow: NonNullable<Wallet['borrow']> }

interface ResolveAmountOrMaxArgs {
  /** Flag label for the amount input, e.g. `--amount` or `--borrow-amount`. */
  amountFlag: string
  /** Flag label for the full-balance input, e.g. `--max` or `--borrow-max`. */
  maxFlag: string
  /** Raw CLI value supplied for `amountFlag`, if any. */
  raw: string | undefined
  /** Whether the user passed `maxFlag`. */
  isMax: boolean
}

/**
 * @description Resolves the mutually-exclusive `<amount>` / `<max>` flag pair to an `AmountOrMax`, enforcing the xor at the CLI surface. The `required: true` overload narrows the return type to `AmountOrMax`; `required: false` allows the absence-of-both case and widens to `AmountOrMax | undefined`. Used by every borrow write verb that accepts `--max` on at least one leg (`close`, `withdraw-collateral`, `repay`). Flag labels are passed in (rather than constructed from a leg prefix) so single-leg callers can use `--amount` / `--max` and `close` can use `--borrow-amount` / `--borrow-max` / `--collateral-amount` / `--collateral-max` from the same code path.
 * @param args - Flag labels, the raw amount value, and the `isMax` boolean.
 * @param required - When `true`, throws if neither flag is set; when `false`, returns `undefined`.
 * @returns The resolved `AmountOrMax`, or `undefined` when the leg is optional and unset.
 * @throws `CliError` with code `validation` when both flags are set, when the amount fails to parse, or when neither flag is set and `required` is `true`.
 */
export function resolveAmountOrMax(
  args: ResolveAmountOrMaxArgs,
  required: true,
): AmountOrMax
export function resolveAmountOrMax(
  args: ResolveAmountOrMaxArgs,
  required: false,
): AmountOrMax | undefined
export function resolveAmountOrMax(
  args: ResolveAmountOrMaxArgs,
  required: boolean,
): AmountOrMax | undefined {
  const { amountFlag, maxFlag, raw, isMax } = args
  if (raw !== undefined && isMax) {
    throw new CliError(
      'validation',
      `Pass either ${amountFlag} or ${maxFlag}, not both`,
      { [amountFlag]: raw, [maxFlag]: true },
    )
  }
  if (isMax) return { max: true }
  if (raw !== undefined) return { amount: parseAmount(raw, amountFlag) }
  if (required) {
    throw new CliError(
      'validation',
      `Either ${amountFlag} or ${maxFlag} is required`,
    )
  }
  return undefined
}

/**
 * @description Projects an `AmountOrMax` (or absent leg) into the envelope's `number | 'max'` representation. The CLI envelope speaks in decimals and the literal string `'max'`; the SDK's discriminated `{ amount } | { amountRaw } | { max }` shape never leaves the wallet method call. Used by every verb that emits `borrowAmount` / `collateralAmount` in the action envelope.
 * @param value - The resolved leg, or `undefined` when the leg was untouched.
 * @returns `'max'` for the full-balance path, the bare number for `{ amount }`, otherwise `undefined`. `amountRaw` is intentionally not handled (the CLI never builds it).
 */
export function amountOrMaxToEnvelope(
  value: AmountOrMax | undefined,
): number | 'max' | undefined {
  if (value === undefined) return undefined
  if ('max' in value) return 'max'
  if ('amount' in value) return value.amount
  return undefined
}

interface RunBorrowActionArgs {
  /** Verb literal embedded in the emitted `borrowAction` envelope. */
  action: BorrowAction
  /** Raw `--market` flag value (resolved through the config allowlist). */
  marketName: string
  /**
   * Builds the SDK params and runs the matching `wallet.borrow.*` method.
   * Implementations may parse amounts and approval modes inline; this runner
   * just provides the resolved market and the capability-narrowed wallet.
   */
  buildAndDispatch: (
    wallet: WalletWithBorrow,
    market: BorrowMarketConfig,
  ) => Promise<BorrowReceipt>
  /**
   * Human-readable amounts to embed in the envelope. The receipt's wei-scale
   * `borrowAmount` / `collateralAmount` are intentionally not emitted at this
   * layer; the CLI surface speaks in decimals and `'max'`.
   */
  envelopeAmounts: BorrowEnvelopeAmounts
}

/**
 * @description Shared backbone for the wallet-scoped borrow write verbs. Loads the wallet context (which validates `PRIVATE_KEY`), asserts the borrow capability, resolves the market through the config allowlist, runs the caller-supplied dispatcher, normalises the SDK's `BorrowReceipt.receipt` (single tx, batched tx array, or UserOp envelope) into a flat array, raises on any non-success leg, and emits a `borrowAction` envelope decorated with `positionAfter` highlights when the SDK supplies them.
 * @param args - Verb-specific dispatcher plus envelope inputs.
 * @returns Promise that resolves once stdout has been written.
 * @throws `CliError` with code `config` when `PRIVATE_KEY` or `wallet.borrow` is missing; `validation` for unknown markets or bad params; `onchain` for reverts and failed receipts; retryable `network` for everything else.
 */
export async function runBorrowAction(
  args: RunBorrowActionArgs,
): Promise<void> {
  const { wallet, config } = await walletContext()
  requireBorrowCapability(wallet)
  const market = resolveBorrowMarket(
    args.marketName,
    configuredBorrowMarkets(config),
  )
  try {
    const borrowReceipt = await args.buildAndDispatch(wallet, market)
    const receipts = toReceiptArray(borrowReceipt.receipt)
    ensureOnchainSuccess(receipts)
    printOutput('borrowAction', {
      action: args.action,
      market: {
        name: market.name,
        marketId: {
          kind: market.kind,
          marketId: market.marketId,
          chainId: market.chainId,
        },
        chainId: market.chainId,
        provider: borrowProviderForKind(market.kind),
      },
      ...args.envelopeAmounts,
      transactions: receipts,
      ltv: borrowReceipt.positionAfter?.ltv,
      healthFactor: borrowReceipt.positionAfter?.healthFactor,
      liquidationPriceFormatted:
        borrowReceipt.positionAfter?.liquidationPriceFormatted,
    })
  } catch (err) {
    rethrowAsCliError(err)
  }
}
