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

export interface ResolvedBorrowBaseParams {
  walletAddress: Address
  recipient: Address
  approvalMode: ApprovalMode
}

export function buildOpenPositionInternalParams(
  params: BorrowOpenPositionParams,
  base: ResolvedBorrowBaseParams,
  resolveAmountWei: (amount: Amount, decimals: number) => bigint,
): BorrowOpenPositionInternalParams {
  const borrowAmountWei = resolveAmountWei(
    params.borrowAmount,
    params.market.borrowAsset.metadata.decimals,
  )
  const collateralAmountWei =
    params.collateralAmount === undefined
      ? undefined
      : resolveAmountWei(
          params.collateralAmount,
          params.market.collateralAsset.metadata.decimals,
        )
  return {
    market: params.market,
    walletAddress: base.walletAddress,
    recipient: base.recipient,
    options: params.options,
    approvalMode: base.approvalMode,
    borrowAmountWei,
    collateralAmountWei,
  }
}

export function buildClosePositionInternalParams(
  params: BorrowClosePositionParams,
  base: ResolvedBorrowBaseParams,
  resolveAmountWeiOrMax: (
    amount: AmountOrMax,
    decimals: number,
  ) => AmountWeiOrMax,
): BorrowClosePositionInternalParams {
  const borrowAmount = resolveAmountWeiOrMax(
    params.borrowAmount,
    params.market.borrowAsset.metadata.decimals,
  )
  const collateralAmount =
    params.collateralAmount === undefined
      ? undefined
      : resolveAmountWeiOrMax(
          params.collateralAmount,
          params.market.collateralAsset.metadata.decimals,
        )
  return {
    market: params.market,
    walletAddress: base.walletAddress,
    recipient: base.recipient,
    options: params.options,
    approvalMode: base.approvalMode,
    borrowAmount,
    collateralAmount,
  }
}

export function buildDepositCollateralInternalParams(
  params: BorrowDepositCollateralParams,
  base: ResolvedBorrowBaseParams,
  resolveAmountWei: (amount: Amount, decimals: number) => bigint,
): BorrowDepositCollateralInternalParams {
  return {
    market: params.market,
    walletAddress: base.walletAddress,
    recipient: base.recipient,
    options: params.options,
    approvalMode: base.approvalMode,
    amountWei: resolveAmountWei(
      params.amount,
      params.market.collateralAsset.metadata.decimals,
    ),
  }
}

export function buildWithdrawCollateralInternalParams(
  params: BorrowWithdrawCollateralParams,
  base: ResolvedBorrowBaseParams,
  resolveAmountWeiOrMax: (
    amount: AmountOrMax,
    decimals: number,
  ) => AmountWeiOrMax,
): BorrowWithdrawCollateralInternalParams {
  return {
    market: params.market,
    walletAddress: base.walletAddress,
    recipient: base.recipient,
    options: params.options,
    approvalMode: base.approvalMode,
    amount: resolveAmountWeiOrMax(
      params.amount,
      params.market.collateralAsset.metadata.decimals,
    ),
  }
}

export function buildRepayInternalParams(
  params: BorrowRepayParams,
  base: ResolvedBorrowBaseParams,
  resolveAmountWeiOrMax: (
    amount: AmountOrMax,
    decimals: number,
  ) => AmountWeiOrMax,
): BorrowRepayInternalParams {
  return {
    market: params.market,
    walletAddress: base.walletAddress,
    recipient: base.recipient,
    options: params.options,
    approvalMode: base.approvalMode,
    amount: resolveAmountWeiOrMax(
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
    recipient: walletAddress,
    approvalMode,
  }
}
