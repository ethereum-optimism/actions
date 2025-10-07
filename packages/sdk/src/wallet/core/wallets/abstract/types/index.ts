import type { TransactionReceipt } from 'viem'
import type { WaitForUserOperationReceiptReturnType } from 'viem/account-abstraction'

/**
 * Transaction receipt for EOA (Externally Owned Account) transactions.
 *
 * Standard Ethereum transaction receipt from regular transactions sent by EOA wallets.
 */
export type EOATransactionReceipt = TransactionReceipt<
  bigint,
  number,
  'success' | 'reverted'
>

/**
 * Transaction receipt for ERC-4337 UserOperations.
 *
 * Receipt from smart wallet transactions processed through bundlers.
 * Contains `userOpHash` to identify the UserOperation.
 */
export type UserOperationTransactionReceipt =
  WaitForUserOperationReceiptReturnType

/**
 * Return type for single transaction operations.
 *
 * Can be either an EOA transaction receipt or a UserOperation receipt,
 * depending on the wallet type used.
 */
export type TransactionReturnType =
  | EOATransactionReceipt
  | UserOperationTransactionReceipt

/**
 * Return type for batch transaction operations.
 *
 * EOA wallets return an array of receipts (one per transaction), while
 * smart wallets return a single UserOperation receipt for the entire batch.
 */
export type BatchTransactionReturnType =
  | EOATransactionReceipt[]
  | UserOperationTransactionReceipt
