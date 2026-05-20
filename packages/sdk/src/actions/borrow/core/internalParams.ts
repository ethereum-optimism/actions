import type { Address } from 'viem'

import type { ApprovalMode } from '@/types/actions.js'
import type {
  Amount,
  AmountOrMax,
  AmountWeiOrMax,
  BorrowClosePositionInternalParams,
  BorrowClosePositionParams,
  BorrowDepositCollateralInternalParams,
  BorrowDepositCollateralParams,
  BorrowOpenPositionInternalParams,
  BorrowOpenPositionParams,
  BorrowRepayInternalParams,
  BorrowRepayParams,
  BorrowWithdrawCollateralInternalParams,
  BorrowWithdrawCollateralParams,
} from '@/types/borrow/index.js'
import { parseDecimalAmount } from '@/utils/assets.js'

export interface ResolvedBorrowBaseParams {
  walletAddress: Address
  approvalMode: ApprovalMode
}

export function buildOpenPositionInternalParams(
  params: BorrowOpenPositionParams,
  base: ResolvedBorrowBaseParams,
): BorrowOpenPositionInternalParams {
  const borrowAmountWei = toAmountWei(
    params.borrowAmount,
    params.market.borrowAsset.metadata.decimals,
  )
  const collateralAmountWei =
    params.collateralAmount === undefined
      ? undefined
      : toAmountWei(
          params.collateralAmount,
          params.market.collateralAsset.metadata.decimals,
        )
  return {
    market: params.market,
    walletAddress: base.walletAddress,
    options: params.options,
    approvalMode: base.approvalMode,
    borrowAmountWei,
    collateralAmountWei,
  }
}

export function buildClosePositionInternalParams(
  params: BorrowClosePositionParams,
  base: ResolvedBorrowBaseParams,
): BorrowClosePositionInternalParams {
  const borrowAmount = toAmountWeiOrMax(
    params.borrowAmount,
    params.market.borrowAsset.metadata.decimals,
  )
  const collateralAmount =
    params.collateralAmount === undefined
      ? undefined
      : toAmountWeiOrMax(
          params.collateralAmount,
          params.market.collateralAsset.metadata.decimals,
        )
  return {
    market: params.market,
    walletAddress: base.walletAddress,
    options: params.options,
    approvalMode: base.approvalMode,
    borrowAmount,
    collateralAmount,
  }
}

export function buildDepositCollateralInternalParams(
  params: BorrowDepositCollateralParams,
  base: ResolvedBorrowBaseParams,
): BorrowDepositCollateralInternalParams {
  return {
    market: params.market,
    walletAddress: base.walletAddress,
    options: params.options,
    approvalMode: base.approvalMode,
    amountWei: toAmountWei(
      params.amount,
      params.market.collateralAsset.metadata.decimals,
    ),
  }
}

export function buildWithdrawCollateralInternalParams(
  params: BorrowWithdrawCollateralParams,
  base: ResolvedBorrowBaseParams,
): BorrowWithdrawCollateralInternalParams {
  return {
    market: params.market,
    walletAddress: base.walletAddress,
    options: params.options,
    approvalMode: base.approvalMode,
    amount: toAmountWeiOrMax(
      params.amount,
      params.market.collateralAsset.metadata.decimals,
    ),
  }
}

export function buildRepayInternalParams(
  params: BorrowRepayParams,
  base: ResolvedBorrowBaseParams,
): BorrowRepayInternalParams {
  return {
    market: params.market,
    walletAddress: base.walletAddress,
    options: params.options,
    approvalMode: base.approvalMode,
    amount: toAmountWeiOrMax(
      params.amount,
      params.market.borrowAsset.metadata.decimals,
    ),
  }
}

export function buildResolvedBorrowBaseParams(
  walletAddress: Address,
  approvalMode: ApprovalMode,
): ResolvedBorrowBaseParams {
  return {
    walletAddress,
    approvalMode,
  }
}

function toAmountWei(amount: Amount, decimals: number): bigint {
  if ('amountRaw' in amount) return amount.amountRaw
  return parseDecimalAmount(amount.amount, decimals)
}

function toAmountWeiOrMax(
  amount: AmountOrMax,
  decimals: number,
): AmountWeiOrMax {
  if ('max' in amount) return { max: true }
  return { amountWei: toAmountWei(amount, decimals) }
}
