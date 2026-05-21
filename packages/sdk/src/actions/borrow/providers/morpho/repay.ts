import type { AccrualPosition } from '@morpho-org/blue-sdk'

import {
  buildMorphoLoanApproval,
  buildMorphoMaxLoanApproval,
} from '@/actions/borrow/providers/morpho/blue.js'
import { EmptyPositionError } from '@/core/error/errors.js'
import type { ApprovalMode } from '@/types/actions.js'
import type {
  AmountWeiOrMax,
  BorrowMarketConfig,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

export type RepayPlan = {
  repayAssetsWei: bigint
  repaySharesWei: bigint
  after: AccrualPosition
}

/**
 * Resolve the assets/shares split for a repay and project the resulting
 * `AccrualPosition`. Shared by `MorphoBorrowProvider._closePosition` and
 * `_repay`.
 * @description `{ max: true }` uses Morpho's shares-based path to avoid
 * the `toAssetsUp` 1-wei dust bug. Morpho's `_accrueInterest` runs
 * on-chain before the share→asset conversion, so the actual transferred
 * amount tracks live state without an SDK-side re-fetch.
 */
export function planRepay(
  amount: AmountWeiOrMax,
  current: AccrualPosition,
  operation: 'closePosition' | 'repay',
): RepayPlan {
  let repayAssetsWei = 0n
  let repaySharesWei = 0n
  if ('max' in amount) {
    if (current.borrowShares === 0n) {
      throw new EmptyPositionError({ operation })
    }
    repaySharesWei = current.borrowShares
  } else {
    repayAssetsWei = amount.amountWei
  }
  const { position: after } = current.repay(repayAssetsWei, repaySharesWei)
  return { repayAssetsWei, repaySharesWei, after }
}

/**
 * Loan-token approval for a repay leg. Shares-based repays (max path)
 * need a `maxUint256` approval because interest accrual between quote and
 * dispatch can push the on-chain transfer above the quoted assets value;
 * exact-assets repays use the precise amount.
 */
export function buildRepayApproval(
  market: BorrowMarketConfig,
  repay: RepayPlan,
  allowance: bigint,
  approvalMode: ApprovalMode,
): TransactionData | undefined {
  return repay.repaySharesWei > 0n
    ? buildMorphoMaxLoanApproval(market, allowance)
    : buildMorphoLoanApproval(
        market,
        repay.repayAssetsWei,
        allowance,
        approvalMode,
      )
}
