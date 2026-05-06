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
 * @description Inspects receipts for failure markers and raises `CliError('onchain')` when any leg failed or carries an unrecognised shape. Default-deny: anything that is not an explicit success (`status === 'success'` for EOA, `success === true` for UserOp) is treated as failure, so a malformed receipt from a misbehaving RPC cannot be silently reported as success.
 * @param receipts - Receipts returned by the SDK.
 * @throws `CliError` with code `onchain` on revert, UserOp failure, or unrecognised shape.
 */
export function ensureOnchainSuccess(
  receipts: readonly WalletTransactionReceipt[],
): void {
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
