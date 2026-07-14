import type { AccrualPosition } from '@morpho-org/blue-sdk'

import {
  encodeMorphoRepay,
  encodeMorphoWithdrawCollateral,
} from '@/actions/borrow/providers/morpho/blue.js'
import {
  buildRepayApproval,
  computeRepay,
  type RepayResult,
} from '@/actions/borrow/providers/morpho/repay.js'
import type {
  BorrowClosePositionInternalParams,
  MorphoBorrowMarketConfig,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

export type CloseResult = {
  repay: RepayResult
  withdrawCollateralWei: bigint
  after: AccrualPosition
}

/**
 * Resolve the repay leg and optional collateral withdrawal for a close,
 * and project the resulting `AccrualPosition`. Pure — does not read
 * on-chain state.
 */
export function computeClose(
  params: BorrowClosePositionInternalParams,
  current: AccrualPosition,
): CloseResult {
  const repay = computeRepay(params.borrowAmount, current, 'closePosition')
  let after = repay.after
  let withdrawCollateralWei = 0n
  if (params.collateralAmount !== undefined) {
    withdrawCollateralWei =
      'max' in params.collateralAmount
        ? after.collateral
        : params.collateralAmount.amountWei
    after = after.withdrawCollateral(withdrawCollateralWei)
  }
  return { repay, withdrawCollateralWei, after }
}

/**
 * Build the transaction bundle for a close: loan-token approval (when
 * needed), repay, then optional collateral withdrawal.
 */
export function buildCloseTransactions(
  params: BorrowClosePositionInternalParams,
  market: MorphoBorrowMarketConfig,
  plan: CloseResult,
  allowance: bigint,
): { txs: TransactionData[]; approvalTx: TransactionData | undefined } {
  const approvalTx = buildRepayApproval(
    market,
    plan.repay,
    allowance,
    params.approvalMode,
  )
  const txs: TransactionData[] = []
  if (approvalTx) txs.push(approvalTx)
  txs.push(
    encodeMorphoRepay(
      market,
      plan.repay.repayAssetsWei,
      plan.repay.repaySharesWei,
      params.walletAddress,
    ),
  )
  if (plan.withdrawCollateralWei > 0n) {
    txs.push(
      encodeMorphoWithdrawCollateral(
        market,
        plan.withdrawCollateralWei,
        params.walletAddress,
        params.walletAddress,
      ),
    )
  }
  return { txs, approvalTx }
}
