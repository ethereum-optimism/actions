import type { AccrualPosition } from '@morpho-org/blue-sdk'

import {
  buildMorphoLoanApproval,
  buildMorphoMaxLoanApproval,
} from '@/actions/shared/morpho/blue.js'
import { EmptyPositionError } from '@/core/error/errors.js'
import type { ApprovalMode } from '@/types/actions.js'
import type {
  AmountWeiOrMax,
  BorrowMarketConfig,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

export type RepayLeg = {
  repayAssetsWei: bigint
  repaySharesWei: bigint
  after: AccrualPosition
}

/**
 * Shared repay-leg accounting for `MorphoBorrowProvider._closePosition`
 * and `_repay`.
 * @description `{ max: true }` uses Morpho's shares-based path to avoid
 * the `toAssetsUp` 1-wei dust bug. Morpho's `_accrueInterest` runs
 * on-chain before the share→asset conversion, so the actual transferred
 * amount tracks live state without an SDK-side re-fetch.
 */
export function prepareRepayLeg(
  amount: AmountWeiOrMax,
  current: AccrualPosition,
  operation: 'closePosition' | 'repay',
): RepayLeg {
  if ('max' in amount) {
    if (current.borrowShares === 0n) {
      throw new EmptyPositionError({ operation })
    }
    const repaySharesWei = current.borrowShares
    const { position } = current.repay(0n, repaySharesWei)
    return { repayAssetsWei: 0n, repaySharesWei, after: position }
  }
  const repayAssetsWei = amount.amountWei
  const { position } = current.repay(repayAssetsWei, 0n)
  return { repayAssetsWei, repaySharesWei: 0n, after: position }
}

/**
 * Loan-token approval for a repay leg. Shares-based repays (max path)
 * need a `maxUint256` approval because interest accrual between quote and
 * dispatch can push the on-chain transfer above the quoted assets value;
 * exact-assets repays use the precise amount.
 */
export function buildRepayApproval(
  market: BorrowMarketConfig,
  repay: RepayLeg,
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
