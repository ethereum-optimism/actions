import type { PublicClient } from 'viem'

import { encodeAaveBorrow } from '@/actions/borrow/providers/aave/calldata.js'
import {
  type AavePositionState,
  type AaveReservePrices,
  type AssembleAaveQuoteArgs,
  projectAavePositionState,
} from '@/actions/borrow/providers/aave/presentation.js'
import { fetchAaveStateAndPrices } from '@/actions/borrow/providers/aave/state.js'
import {
  buildAaveCollateralDeposit,
  buildAaveCollateralWithdraw,
  buildAaveRepay,
  resolveAaveAmount,
} from '@/actions/borrow/providers/aave/write.js'
import { EmptyPositionError } from '@/core/error/errors.js'
import type {
  AaveBorrowMarketConfig,
  BorrowClosePositionInternalParams,
  BorrowDepositCollateralInternalParams,
  BorrowOpenPositionInternalParams,
  BorrowRepayInternalParams,
  BorrowWithdrawCollateralInternalParams,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

/** A quote minus the provider-resolved settings, returned by each `planAaveX`. */
export type AaveQuotePlan = Omit<
  AssembleAaveQuoteArgs,
  'quoteExpirationSeconds' | 'healthBufferPct'
>

function project(
  current: AavePositionState,
  prices: AaveReservePrices,
  market: AaveBorrowMarketConfig,
  delta: { collateralDelta: bigint; debtDelta: bigint },
): AavePositionState {
  return projectAavePositionState(current, prices, delta, {
    collateral: market.collateralAsset.metadata.decimals,
    debt: market.borrowAsset.metadata.decimals,
  })
}

export async function planAaveOpen(
  client: PublicClient,
  market: AaveBorrowMarketConfig,
  params: BorrowOpenPositionInternalParams,
): Promise<AaveQuotePlan> {
  const { current, prices } = await fetchAaveStateAndPrices(
    client,
    market,
    params.walletAddress,
  )
  const collateral = params.collateralAmountWei ?? 0n
  const txs: TransactionData[] = []
  let approvalsSkipped = true
  if (collateral > 0n) {
    const deposit = await buildAaveCollateralDeposit(
      client,
      market,
      collateral,
      params.walletAddress,
      params.approvalMode,
    )
    txs.push(...deposit.txs)
    approvalsSkipped = deposit.approvalsSkipped
  }
  txs.push(
    encodeAaveBorrow(market, params.borrowAmountWei, params.walletAddress),
  )
  const after = project(current, prices, market, {
    collateralDelta: collateral,
    debtDelta: params.borrowAmountWei,
  })
  return {
    action: 'open',
    market,
    before: current,
    after,
    transactions: txs,
    quoteAmounts: {
      borrowAmountRaw: params.borrowAmountWei,
      collateralAmountRaw: collateral > 0n ? collateral : undefined,
    },
    approvalsSkipped,
  }
}

export async function planAaveRepay(
  client: PublicClient,
  market: AaveBorrowMarketConfig,
  params: BorrowRepayInternalParams,
): Promise<AaveQuotePlan> {
  const { current, prices } = await fetchAaveStateAndPrices(
    client,
    market,
    params.walletAddress,
  )
  const { txs, approvalsSkipped, repayAmount } = await buildAaveRepay(
    client,
    market,
    params.amount,
    current.debtAmount,
    params.walletAddress,
    params.approvalMode,
  )
  const after = project(current, prices, market, {
    collateralDelta: 0n,
    debtDelta: -repayAmount,
  })
  return {
    action: 'repay',
    market,
    before: current,
    after,
    transactions: txs,
    quoteAmounts: { borrowAmountRaw: repayAmount },
    approvalsSkipped,
  }
}

export async function planAaveDepositCollateral(
  client: PublicClient,
  market: AaveBorrowMarketConfig,
  params: BorrowDepositCollateralInternalParams,
): Promise<AaveQuotePlan> {
  // `max` is ambiguous for the native-ETH gateway path and unused (Aave
  // collateral is supplied at lend time); require an explicit amount.
  if ('max' in params.amount) {
    throw new Error(
      'Aave depositCollateral does not support a max amount; pass an explicit amount.',
    )
  }
  const amountWei = params.amount.amountWei
  const { current, prices } = await fetchAaveStateAndPrices(
    client,
    market,
    params.walletAddress,
  )
  const { txs, approvalsSkipped } = await buildAaveCollateralDeposit(
    client,
    market,
    amountWei,
    params.walletAddress,
    params.approvalMode,
  )
  const after = project(current, prices, market, {
    collateralDelta: amountWei,
    debtDelta: 0n,
  })
  return {
    action: 'depositCollateral',
    market,
    before: current,
    after,
    transactions: txs,
    quoteAmounts: { collateralAmountRaw: amountWei },
    approvalsSkipped,
  }
}

export async function planAaveWithdrawCollateral(
  client: PublicClient,
  market: AaveBorrowMarketConfig,
  params: BorrowWithdrawCollateralInternalParams,
): Promise<AaveQuotePlan> {
  const { current, prices } = await fetchAaveStateAndPrices(
    client,
    market,
    params.walletAddress,
  )
  const { amount, isMax } = resolveAaveAmount(
    params.amount,
    current.collateralAmount,
  )
  if (isMax && current.collateralAmount === 0n) {
    throw new EmptyPositionError({ operation: 'withdrawCollateral' })
  }
  const txs = await buildAaveCollateralWithdraw(
    client,
    market,
    amount,
    isMax,
    params.walletAddress,
    params.approvalMode,
  )
  const after = project(current, prices, market, {
    collateralDelta: -amount,
    debtDelta: 0n,
  })
  return {
    action: 'withdrawCollateral',
    market,
    before: current,
    after,
    transactions: txs,
    // Native-ETH withdraws prepend a gateway aToken approval; direct ones don't.
    approvalsSkipped: txs.length === 1,
    quoteAmounts: { collateralAmountRaw: amount },
  }
}

export async function planAaveClose(
  client: PublicClient,
  market: AaveBorrowMarketConfig,
  params: BorrowClosePositionInternalParams,
): Promise<AaveQuotePlan> {
  const { current, prices } = await fetchAaveStateAndPrices(
    client,
    market,
    params.walletAddress,
  )
  const repay = await buildAaveRepay(
    client,
    market,
    params.borrowAmount,
    current.debtAmount,
    params.walletAddress,
    params.approvalMode,
  )
  const txs = [...repay.txs]

  let collateralDelta = 0n
  if (params.collateralAmount !== undefined) {
    const { amount: withdrawAmount, isMax } = resolveAaveAmount(
      params.collateralAmount,
      current.collateralAmount,
    )
    collateralDelta = -withdrawAmount
    txs.push(
      ...(await buildAaveCollateralWithdraw(
        client,
        market,
        withdrawAmount,
        isMax,
        params.walletAddress,
        params.approvalMode,
      )),
    )
  }

  const after = project(current, prices, market, {
    collateralDelta,
    debtDelta: -repay.repayAmount,
  })
  return {
    action: 'close',
    market,
    before: current,
    after,
    transactions: txs,
    quoteAmounts: {
      borrowAmountRaw: repay.repayAmount,
      collateralAmountRaw: collateralDelta < 0n ? -collateralDelta : undefined,
    },
    // Repay leg only; a native-ETH withdraw approval isn't pre-cleared.
    approvalsSkipped: repay.approvalsSkipped,
  }
}
