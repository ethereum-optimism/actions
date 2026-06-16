import type { AccrualPosition } from '@morpho-org/blue-sdk'

import {
  buildMorphoCollateralApproval,
  encodeMorphoBorrow,
  encodeMorphoSupplyCollateral,
} from '@/actions/borrow/providers/morpho/blue.js'
import type {
  BorrowOpenPositionInternalParams,
  MorphoBorrowMarketConfig,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

/**
 * Project the `AccrualPosition` that results from an open: optional
 * collateral supply, then a borrow. Pure — does not read on-chain state.
 */
export function computeOpen(
  params: BorrowOpenPositionInternalParams,
  current: AccrualPosition,
): AccrualPosition {
  let after = current
  if (params.collateralAmountWei !== undefined) {
    after = after.supplyCollateral(params.collateralAmountWei)
  }
  return after.borrow(params.borrowAmountWei, 0n).position
}

/**
 * Build the transaction bundle for an open: optional collateral approval,
 * optional collateral supply, and the borrow itself.
 */
export function buildOpenTransactions(
  params: BorrowOpenPositionInternalParams,
  market: MorphoBorrowMarketConfig,
  allowance: bigint,
): { txs: TransactionData[]; approvalTx: TransactionData | undefined } {
  const txs: TransactionData[] = []
  const approvalTx = buildMorphoCollateralApproval(
    market,
    params.collateralAmountWei,
    allowance,
    params.approvalMode,
  )
  if (approvalTx) txs.push(approvalTx)
  if (
    params.collateralAmountWei !== undefined &&
    params.collateralAmountWei > 0n
  ) {
    txs.push(
      encodeMorphoSupplyCollateral(
        market,
        params.collateralAmountWei,
        params.walletAddress,
      ),
    )
  }
  txs.push(
    encodeMorphoBorrow(
      market,
      params.borrowAmountWei,
      0n,
      params.walletAddress,
      params.walletAddress,
    ),
  )
  return { txs, approvalTx }
}
