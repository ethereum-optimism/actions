/**
 * Transaction-level options shared across SDK domains (Lend, Swap, Borrow, …).
 * @description Optional per-call overrides for transaction execution.
 */
export interface TransactionOptions {
  /** Deadline for transaction (timestamp) */
  deadline?: number
  /** Gas limit override */
  gasLimit?: bigint
  /** Gas price override */
  gasPrice?: bigint
}
