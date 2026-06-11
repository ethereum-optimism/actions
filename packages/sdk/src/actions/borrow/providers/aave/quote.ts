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
import { EmptyPositionError, InvalidParamsError } from '@/core/error/errors.js'
import type {
  AaveBorrowMarketConfig,
  BorrowClosePositionInternalParams,
  BorrowDepositCollateralInternalParams,
  BorrowOpenPositionInternalParams,
  BorrowRepayInternalParams,
  BorrowWithdrawCollateralInternalParams,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

/**
 * The `assembleAaveBorrowQuote` arguments minus the provider-resolved settings
 * (`recipient`, expiration, health buffer), returned by each
 * `buildAave*QuoteArgs`.
 */
export type AaveQuoteArgs = Omit<
  AssembleAaveQuoteArgs,
  'recipient' | 'quoteExpirationSeconds' | 'healthBufferPct'
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

export async function buildAaveOpenQuoteArgs(
  client: PublicClient,
  market: AaveBorrowMarketConfig,
  params: BorrowOpenPositionInternalParams,
): Promise<AaveQuoteArgs> {
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
  const positionAfter = project(current, prices, market, {
    collateralDelta: collateral,
    debtDelta: params.borrowAmountWei,
  })
  return {
    action: 'open',
    market,
    positionBefore: current,
    positionAfter,
    transactions: txs,
    quoteAmounts: {
      borrowAmountRaw: params.borrowAmountWei,
      collateralAmountRaw: collateral > 0n ? collateral : undefined,
    },
    approvalsSkipped,
  }
}

export async function buildAaveRepayQuoteArgs(
  client: PublicClient,
  market: AaveBorrowMarketConfig,
  params: BorrowRepayInternalParams,
): Promise<AaveQuoteArgs> {
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
  const positionAfter = project(current, prices, market, {
    collateralDelta: 0n,
    debtDelta: -repayAmount,
  })
  return {
    action: 'repay',
    market,
    positionBefore: current,
    positionAfter,
    transactions: txs,
    quoteAmounts: { borrowAmountRaw: repayAmount },
    approvalsSkipped,
  }
}

export async function buildAaveDepositCollateralQuoteArgs(
  client: PublicClient,
  market: AaveBorrowMarketConfig,
  params: BorrowDepositCollateralInternalParams,
): Promise<AaveQuoteArgs> {
  // `max` is ambiguous for the native-ETH gateway path and unused (Aave
  // collateral is supplied at lend time); require an explicit amount.
  if ('max' in params.amount) {
    throw new InvalidParamsError({
      param: 'amount',
      expected:
        'an explicit amount (max is unsupported for Aave depositCollateral)',
    })
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
  const positionAfter = project(current, prices, market, {
    collateralDelta: amountWei,
    debtDelta: 0n,
  })
  return {
    action: 'depositCollateral',
    market,
    positionBefore: current,
    positionAfter,
    transactions: txs,
    quoteAmounts: { collateralAmountRaw: amountWei },
    approvalsSkipped,
  }
}

export async function buildAaveWithdrawCollateralQuoteArgs(
  client: PublicClient,
  market: AaveBorrowMarketConfig,
  params: BorrowWithdrawCollateralInternalParams,
): Promise<AaveQuoteArgs> {
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
  const positionAfter = project(current, prices, market, {
    collateralDelta: -amount,
    debtDelta: 0n,
  })
  return {
    action: 'withdrawCollateral',
    market,
    positionBefore: current,
    positionAfter,
    transactions: txs,
    // Native-ETH withdraws prepend a gateway aToken approval; direct ones don't.
    approvalsSkipped: txs.length === 1,
    quoteAmounts: { collateralAmountRaw: amount },
  }
}

export async function buildAaveCloseQuoteArgs(
  client: PublicClient,
  market: AaveBorrowMarketConfig,
  params: BorrowClosePositionInternalParams,
): Promise<AaveQuoteArgs> {
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
  let withdrawApprovalsSkipped = true
  if (params.collateralAmount !== undefined) {
    const { amount: withdrawAmount, isMax } = resolveAaveAmount(
      params.collateralAmount,
      current.collateralAmount,
    )
    // A max close with no collateral has nothing to withdraw; emitting a
    // withdraw-all leg would revert, so the repay proceeds on its own.
    if (!(isMax && current.collateralAmount === 0n)) {
      collateralDelta = -withdrawAmount
      const withdrawTxs = await buildAaveCollateralWithdraw(
        client,
        market,
        withdrawAmount,
        isMax,
        params.walletAddress,
        params.approvalMode,
      )
      // Native-ETH withdraws prepend a gateway aToken approval.
      withdrawApprovalsSkipped = withdrawTxs.length === 1
      txs.push(...withdrawTxs)
    }
  }

  const positionAfter = project(current, prices, market, {
    collateralDelta,
    debtDelta: -repay.repayAmount,
  })
  return {
    action: 'close',
    market,
    positionBefore: current,
    positionAfter,
    transactions: txs,
    quoteAmounts: {
      borrowAmountRaw: repay.repayAmount,
      collateralAmountRaw: collateralDelta < 0n ? -collateralDelta : undefined,
    },
    approvalsSkipped: repay.approvalsSkipped && withdrawApprovalsSkipped,
  }
}
