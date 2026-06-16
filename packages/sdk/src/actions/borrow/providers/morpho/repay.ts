import type { AccrualPosition } from '@morpho-org/blue-sdk'

import {
  buildMorphoLoanApproval,
  buildMorphoMaxLoanApproval,
} from '@/actions/borrow/providers/morpho/blue.js'
import { EmptyPositionError } from '@/core/error/errors.js'
import type { ApprovalMode } from '@/types/actions.js'
import type {
  AmountWeiOrMax,
  MorphoBorrowMarketConfig,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

export type RepayResult = {
  repayAssetsWei: bigint
  repaySharesWei: bigint
  // Live accrued debt at quote time. Used to bound a shares-based (max) repay
  // approval in exact mode, where there is no fixed asset amount to approve.
  liveDebtAssetsWei: bigint
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
export function computeRepay(
  amount: AmountWeiOrMax,
  current: AccrualPosition,
  operation: 'closePosition' | 'repay',
): RepayResult {
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
  return {
    repayAssetsWei,
    repaySharesWei,
    liveDebtAssetsWei: current.borrowAssets,
    after,
  }
}

/**
 * Loan-token approval for a repay leg. Shares-based repays (max path) have no
 * fixed asset amount because interest accrual between quote and dispatch can
 * push the on-chain transfer above the quoted debt: `max` mode grants the
 * canonical unlimited allowance, while `exact` mode bounds the approval to the
 * live-debt snapshot (tradeoff: accrual past the snapshot can under-approve;
 * quote expiry bounds the window). Exact-assets repays use the precise amount.
 */
export function buildRepayApproval(
  market: MorphoBorrowMarketConfig,
  repay: RepayResult,
  allowance: bigint,
  approvalMode: ApprovalMode,
): TransactionData | undefined {
  if (repay.repaySharesWei > 0n) {
    return approvalMode === 'max'
      ? buildMorphoMaxLoanApproval(market, allowance)
      : buildMorphoLoanApproval(
          market,
          repay.liveDebtAssetsWei,
          allowance,
          approvalMode,
        )
  }
  return buildMorphoLoanApproval(
    market,
    repay.repayAssetsWei,
    allowance,
    approvalMode,
  )
}
