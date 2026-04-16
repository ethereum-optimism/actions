import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { TransactionData } from '@/types/transaction.js'
import type {
  BatchTransactionReturnType,
  TransactionReturnType,
} from '@/wallet/core/wallets/abstract/types/index.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

/**
 * Dispatch a list of transactions to a wallet.
 * @description Single-element → `wallet.send()`; multi-element →
 * `wallet.sendBatch()`. An empty list is a programming error and throws.
 *
 * Shared by every wallet-signing namespace (WalletLendNamespace,
 * WalletSwapNamespace, WalletBorrowNamespace, …). Implemented as a
 * module-level helper rather than a base class so namespaces can inherit
 * from their domain-specific base (BaseLendNamespace etc.) without a
 * multi-inheritance bind.
 * @param wallet - The wallet that signs and sends the transactions
 * @param transactions - Non-empty list of transactions to dispatch
 * @param chainId - Target chain for the transactions
 * @returns Receipt(s) from the underlying send / sendBatch call
 * @throws Error if `transactions` is empty
 */
export async function executeTransactionBatch(
  wallet: Wallet,
  transactions: readonly TransactionData[],
  chainId: SupportedChainId,
): Promise<TransactionReturnType | BatchTransactionReturnType> {
  if (transactions.length === 0) {
    throw new Error('executeTransactionBatch: empty transaction list')
  }
  if (transactions.length === 1) {
    return wallet.send(transactions[0], chainId)
  }
  return wallet.sendBatch([...transactions], chainId)
}
