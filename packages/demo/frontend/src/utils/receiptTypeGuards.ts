import type {
  EOATransactionReceipt,
  LendTransactionReceipt,
  UserOperationTransactionReceipt,
} from '@eth-optimism/actions-sdk'

/**
 * Type guard to check if receipt is an EOA transaction receipt
 */
export function isEOATransactionReceipt(
  receipt: LendTransactionReceipt,
): receipt is EOATransactionReceipt {
  return !Array.isArray(receipt) && !('userOpHash' in receipt)
}

/**
 * Type guard to check if receipt is a batch EOA transaction receipt
 */
export function isBatchEOATransactionReceipt(
  receipt: LendTransactionReceipt,
): receipt is EOATransactionReceipt[] {
  return Array.isArray(receipt)
}

/**
 * Type guard to check if receipt is a user operation transaction receipt
 */
export function isUserOperationTransactionReceipt(
  receipt: LendTransactionReceipt,
): receipt is UserOperationTransactionReceipt {
  return 'userOpHash' in receipt
}
