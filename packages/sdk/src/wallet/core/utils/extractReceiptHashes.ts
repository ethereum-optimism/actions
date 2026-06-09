import type { Hex } from 'viem'

import type {
  BatchTransactionReturnType,
  TransactionReturnType,
} from '@/wallet/core/wallets/abstract/types/index.js'

export interface ReceiptHashes {
  transactionHash?: Hex
  transactionHashes?: Hex[]
  userOpHash?: Hex
}

/**
 * Pull user-facing identifier hash fields from wallet receipt unions.
 * @description EOA batches expose `transactionHashes`, single EOA sends expose
 * `transactionHash`, and ERC-4337 sends expose `userOpHash`.
 * @param receipt - Receipt returned by a wallet send or sendBatch call.
 * @returns Identifier hash fields suitable for action receipt envelopes.
 */
export function extractReceiptHashes(
  receipt: TransactionReturnType | BatchTransactionReturnType,
): ReceiptHashes {
  if (Array.isArray(receipt)) {
    return { transactionHashes: receipt.map((r) => r.transactionHash) }
  }
  if ('userOpHash' in receipt) {
    return { userOpHash: receipt.userOpHash }
  }
  return { transactionHash: receipt.transactionHash }
}
