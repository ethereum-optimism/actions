import type { Address } from 'viem'

import type { LendTransaction, TransactionData } from '@/types/lend/index.js'

/**
 * Creates a mock lend transaction for testing
 */
export function createMockLendTransaction(params: {
  amount: bigint
  asset: Address
  marketId: Address
  approval?: TransactionData
  position: TransactionData
}): LendTransaction {
  return {
    amount: params.amount,
    asset: params.asset,
    marketId: params.marketId,
    apy: 0.05,
    transactionData: {
      approval: params.approval,
      position: params.position,
    },
  }
}
