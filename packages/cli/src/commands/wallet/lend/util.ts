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

/**
 * @description Parses a CLI-provided amount string. Accepts any positive
 * finite number, including decimals (the SDK converts to wei using the
 * asset's decimals). Bigint-style strings (`100n`) are rejected; use a
 * decimal literal instead.
 * @param raw - Flag value as passed on argv.
 * @returns The validated amount as a number.
 * @throws `CliError` with code `validation` when the value is not a
 * positive finite number.
 */
export function parseAmount(raw: string): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new CliError(
      'validation',
      `Invalid --amount: ${raw} (expected a positive number)`,
      { amount: raw },
    )
  }
  return value
}

function isEOAReceipt(value: SingleReceipt): value is EOATransactionReceipt {
  return (
    typeof value === 'object' &&
    value !== null &&
    'transactionHash' in value &&
    'status' in value &&
    typeof (value as { status?: unknown }).status === 'string'
  )
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
 * @description Inspects receipts for failure markers and raises
 * `CliError('onchain')` when any leg failed. EOA receipts use
 * `status: 'reverted'`; UserOp receipts use `success: false`. Called
 * after the SDK call resolves.
 * @param receipts - Receipts returned by the SDK.
 * @throws `CliError` with code `onchain` when any receipt failed.
 */
export function ensureOnchainSuccess(receipts: readonly SingleReceipt[]): void {
  for (const r of receipts) {
    if (isEOAReceipt(r) && r.status === 'reverted') {
      throw new CliError('onchain', 'Transaction reverted', {
        transactionHash: r.transactionHash,
        blockNumber: r.blockNumber,
      })
    }
    if (
      !isEOAReceipt(r) &&
      'success' in r &&
      (r as { success?: unknown }).success === false
    ) {
      throw new CliError('onchain', 'UserOperation failed', {
        userOpHash: (r as { userOpHash?: unknown }).userOpHash,
      })
    }
  }
}

const ONCHAIN_HINTS = [
  'execution reverted',
  'revert',
  'ContractFunctionRevertedError',
  'ContractFunctionExecutionError',
]

/**
 * @description Re-throws SDK exceptions as the right `CliError` code.
 * Pre-flight reverts (gas estimation, eth_call simulation) and viem
 * `ContractFunctionRevertedError` map to `onchain`; everything else
 * (RPC down, timeout, fetch failure) defaults to retryable `network`.
 * Existing `CliError` instances pass through unchanged.
 * @param err - Caught exception.
 * @returns Never; always throws.
 */
export function rethrowAsCliError(err: unknown): never {
  if (err instanceof CliError) throw err
  const message = err instanceof Error ? err.message : String(err)
  const name = err instanceof Error ? err.name : ''
  const looksOnchain = ONCHAIN_HINTS.some(
    (h) => message.includes(h) || name.includes(h),
  )
  throw new CliError(looksOnchain ? 'onchain' : 'network', message, {
    cause: err,
  })
}
