import type {
  EOATransactionReceipt,
  UserOperationTransactionReceipt,
} from '@eth-optimism/actions-sdk'

import { CliError } from '@/output/errors.js'

/**
 * @description One element of the CLI's emitted `transactions[]` array. The SDK's transaction return types collapse single receipts and arrays (`EOATransactionReceipt | UserOperationTransactionReceipt | EOATransactionReceipt[]`); this is the per-element shape after `toReceiptArray` flattens.
 */
export type WalletTransactionReceipt =
  | EOATransactionReceipt
  | UserOperationTransactionReceipt

/**
 * @description Normalises an SDK transaction return value to a flat array of receipts. EOA `send` returns one receipt; `sendBatch` returns an array; smart wallets return one UserOperation receipt for the whole batch. The CLI always emits an array so agents iterate without branching on union shape.
 * @param receipt - Raw return value from the SDK.
 * @returns Array of one or more receipts.
 */
export function toReceiptArray(
  receipt: WalletTransactionReceipt | WalletTransactionReceipt[],
): readonly WalletTransactionReceipt[] {
  return Array.isArray(receipt) ? receipt : [receipt]
}

/**
 * @description Default-deny failure check: anything that isn't an explicit `success === true` (UserOp) or `status === 'success'` (EOA) is a failure, including unrecognised shapes from a misbehaving RPC.
 * @param r - Receipt to inspect.
 * @returns `true` if the receipt is anything other than an explicit success.
 */
function isReceiptFailure(r: WalletTransactionReceipt): boolean {
  return 'success' in r ? r.success !== true : r.status !== 'success'
}

/**
 * @description Builds the `CliError` envelope for a failed receipt, picking the right diagnostic fields per receipt shape.
 * @param r - Receipt that matched `isReceiptFailure`.
 * @returns A `CliError('onchain')` with shape-appropriate context.
 */
function receiptFailure(r: WalletTransactionReceipt): CliError {
  if ('success' in r) {
    return new CliError('onchain', 'UserOperation failed', {
      userOpHash: r.userOpHash,
    })
  }
  return new CliError('onchain', `Transaction status: ${String(r.status)}`, {
    transactionHash: r.transactionHash,
    blockNumber: r.blockNumber,
  })
}

/**
 * @description Inspects receipts for failure markers and raises `CliError('onchain')` when any leg failed or carries an unrecognised shape. Default-deny: anything that is not an explicit success (`status === 'success'` for EOA, `success === true` for UserOp) is treated as failure, so a malformed receipt from a misbehaving RPC cannot be silently reported as success. The thrown error carries the full `receipts` array under `details.transactions` (alongside the failing leg's own diagnostics) so a batched failure does not drop the already-mined legs: on a sequential EOA bundle like `[approve, supplyCollateral, borrow]`, a reverted `borrow` still surfaces the mined `approve` hash and the gas it spent.
 * @param receipts - Receipts returned by the SDK.
 * @throws `CliError` with code `onchain` on revert, UserOp failure, or unrecognised shape; `details.transactions` holds every receipt in the batch.
 */
export function ensureOnchainSuccess(
  receipts: readonly WalletTransactionReceipt[],
): void {
  for (const r of receipts) {
    if (!isReceiptFailure(r)) continue
    const failure = receiptFailure(r)
    throw new CliError('onchain', failure.message, {
      ...(failure.details as Record<string, unknown>),
      transactions: receipts,
    })
  }
}
