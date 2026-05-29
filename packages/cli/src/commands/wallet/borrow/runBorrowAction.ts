import {
  type Amount,
  type AmountOrMax,
  APPROVAL_MODES,
  type ApprovalMode,
  type BorrowAction,
  type BorrowMarketConfig,
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

/**
 * @description Wraps a `parseAmount(raw)` result in the `{ amount }` discriminant of the SDK's `Amount` union. Borrow params don't accept bare numbers; #379 conventions require either `{ amount }` (human-readable) or `{ amountRaw }` (wei). The CLI always takes a human-readable amount, so we never produce the raw variant.
 * @param raw - The CLI argv value as a string.
 * @param flag - Flag label surfaced in `CliError` messages (e.g. `--borrow-amount`).
 * @returns An `Amount` of the form `{ amount: number }`.
 * @throws `CliError` with code `validation` when the value is not a positive plain decimal.
 */
export function toAmount(raw: string, flag = '--amount'): Amount {
  return { amount: parseAmount(raw, flag) }
}

/**
 * @description Builds an `AmountOrMax` from the mutually-exclusive amount/max flag pair. Returns `{ max: true }` when `isMax` is set, otherwise wraps the parsed amount via `toAmount`. Callers are responsible for enforcing the xor at the CLI surface; this helper just maps the resolved booleans to the right discriminant.
 * @param raw - The CLI argv value, if any.
 * @param isMax - Whether the user opted into the SDK's full-balance path.
 * @param flag - Flag label surfaced in `CliError` messages (e.g. `--borrow-amount`).
 * @returns An `AmountOrMax` value.
 * @throws `CliError` with code `validation` when `isMax` is false and `raw` is not a positive plain decimal.
 */
export function toAmountOrMax(
  raw: string | undefined,
  isMax: boolean,
  flag = '--amount',
): AmountOrMax {
  if (isMax) return { max: true }
  return toAmount(raw as string, flag)
}

/**
 * @description Validates `--approval-mode` against the SDK's `APPROVAL_MODES` allowlist. Returns `undefined` when the flag is omitted so the wallet's resolved default applies. Identical shape to the lend helper; deduplicated here because both lend and borrow expose the same flag with the same semantics.
 * @param raw - The argv value as a string, or `undefined`.
 * @returns The validated `ApprovalMode`, or `undefined` when unset.
 * @throws `CliError` with code `validation` when `raw` is not a recognised approval mode.
 */
export function parseApprovalMode(
  raw: string | undefined,
): ApprovalMode | undefined {
  if (raw === undefined) return undefined
  if ((APPROVAL_MODES as readonly string[]).includes(raw)) {
    return raw as ApprovalMode
  }
  throw new CliError(
    'validation',
    `Invalid --approval-mode: ${raw} (expected ${APPROVAL_MODES.join(' or ')})`,
    { approvalMode: raw },
  )
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
        provider: market.borrowProvider,
      },
      ...args.envelopeAmounts,
      transactions: receipts,
      ltv: borrowReceipt.positionAfter?.ltv ?? undefined,
      healthFactor: borrowReceipt.positionAfter?.healthFactor ?? undefined,
      liquidationPriceFormatted:
        borrowReceipt.positionAfter?.liquidationPriceFormatted,
    })
  } catch (err) {
    rethrowAsCliError(err)
  }
}
