import type {
  EOATransactionReceipt,
  LendTransactionReceipt,
  UserOperationTransactionReceipt,
} from '@eth-optimism/actions-sdk'

import { CliError } from '@/output/errors.js'

/**
 * Single normalised receipt the CLI emits. The SDK's union type collapses
 * `EOATransactionReceipt | UserOperationTransactionReceipt | EOATransactionReceipt[]`,
 * which is awkward to consume from the agent side.
 */
export type SingleReceipt =
  | EOATransactionReceipt
  | UserOperationTransactionReceipt

// Plain positive decimal: digits, optional `.` followed by more digits. No
// scientific notation, no hex, no leading `+`/`-`/`.`/whitespace. The SDK
// converts to wei using the asset's decimals; permitting `1e-19` here would
// silently round to 0 wei after `parseUnits`.
const DECIMAL_AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d+)?$/

function rejectAmount(raw: string): never {
  throw new CliError(
    'validation',
    `Invalid --amount: ${raw} (expected a positive decimal, e.g. 10 or 0.5)`,
    { amount: raw },
  )
}

/**
 * @description Parses a CLI-provided amount string. Accepts plain positive decimals (`10`, `0.5`, `1.25`). Rejects scientific notation, hex, leading signs, whitespace, bigint-style suffixes, and integer parts above `Number.MAX_SAFE_INTEGER` (which lose precision through the float round-trip into the SDK).
 * @param raw - Flag value as passed on argv.
 * @returns The validated amount as a number.
 * @throws `CliError` with code `validation` when the value is not a positive plain decimal.
 */
export function parseAmount(raw: string): number {
  if (!DECIMAL_AMOUNT.test(raw)) rejectAmount(raw)
  const intPart = raw.split('.')[0] ?? ''
  if (BigInt(intPart) > BigInt(Number.MAX_SAFE_INTEGER)) rejectAmount(raw)
  const value = Number(raw)
  if (value <= 0) rejectAmount(raw)
  return value
}

/**
 * @description Normalises the SDK's union receipt type to a flat array.
 * EOA `send` returns a single receipt; `sendBatch` returns an array;
 * smart wallets return a single UserOperation receipt regardless. The
 * CLI always emits an array so the agent can iterate without branching.
 * @param receipt - Raw return value from the SDK.
 * @returns Array of one or more receipts.
 */
export function toReceiptArray(
  receipt: LendTransactionReceipt,
): readonly SingleReceipt[] {
  return Array.isArray(receipt) ? receipt : [receipt]
}

/**
 * @description Inspects receipts for failure markers and raises `CliError('onchain')` when any leg failed or carries an unrecognised shape. Default-deny: anything that is not an explicit success (`status === 'success'` for EOA, `success === true` for UserOp) is treated as failure, so a malformed receipt from a misbehaving RPC cannot be silently reported as success.
 * @param receipts - Receipts returned by the SDK.
 * @throws `CliError` with code `onchain` on revert, UserOp failure, or unrecognised shape.
 */
export function ensureOnchainSuccess(receipts: readonly SingleReceipt[]): void {
  for (const r of receipts) {
    if ('success' in r) {
      if (r.success !== true) {
        throw new CliError('onchain', 'UserOperation failed', {
          userOpHash: r.userOpHash,
        })
      }
      continue
    }
    if (r.status === 'success') continue
    throw new CliError('onchain', `Transaction status: ${String(r.status)}`, {
      transactionHash: r.transactionHash,
      blockNumber: r.blockNumber,
    })
  }
}
