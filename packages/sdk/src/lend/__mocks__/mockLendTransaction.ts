import type { Address } from 'viem'

import type { LendTransaction, TransactionData } from '@/types/lend/index.js'

/**
 * Creates a mock lend transaction for testing openPosition
 */
export function createMockOpenTransaction(params: {
  amount: bigint
  asset: Address
  marketId: Address
  approval?: TransactionData
  openPosition?: TransactionData
}): LendTransaction {
  return {
    amount: params.amount,
    asset: params.asset,
    marketId: params.marketId,
    apy: 0.05,
    transactionData: {
      approval: params.approval,
      openPosition: params.openPosition,
    },
    slippage: 50,
  }
}

/**
 * Creates a mock lend transaction for testing closePosition
 */
export function createMockCloseTransaction(params: {
  amount: bigint
  asset: Address
  marketId: Address
  closePosition: TransactionData
}): LendTransaction {
  return {
    amount: params.amount,
    asset: params.asset,
    marketId: params.marketId,
    apy: 0.05,
    transactionData: {
      closePosition: params.closePosition,
    },
    slippage: 50,
  }
}
