import type { TransactionReceipt } from 'viem'

import { ActionsError } from '@/core/error/errors.js'

/**
 * Error for a transaction that was included on-chain but reverted
 * @description Thrown when a transaction makes it into a block (i.e. has a
 * confirmed receipt) yet the EVM execution failed. The full
 * {@link TransactionReceipt | transaction receipt} is attached for
 * post-mortem analysis (status, logs, gas usage, etc.).
 */
export class TransactionConfirmedButRevertedError extends ActionsError {
  override name = 'TransactionConfirmedButRevertedError' as const
  /** Full receipt returned by the node for the reverted transaction */
  receipt: TransactionReceipt

  /**
   * Create an instance of TransactionConfirmedButRevertedError
   * @param message - Human-readable description of the failure
   * @param receipt - Confirmed transaction receipt indicating a revert
   */
  constructor(message: string, receipt: TransactionReceipt) {
    if (!message || typeof message !== 'string') {
      throw new Error('"message" must be a nonempty string.')
    }

    super(message, { metaMessages: [`txHash: ${receipt.transactionHash}`] })
    this.receipt = receipt
  }
}
