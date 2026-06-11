import type { Address, PublicClient } from 'viem'
import { maxUint256 } from 'viem'

import {
  buildAavePoolApproval,
  encodeAaveDepositETH,
  encodeAaveRepay,
  encodeAaveSupply,
  encodeAaveWithdraw,
  encodeAaveWithdrawETH,
} from '@/actions/borrow/providers/aave/calldata.js'
import { fetchAaveReserveTokens } from '@/actions/borrow/providers/aave/state.js'
import {
  requireAavePoolAddress,
  requireAaveWethGatewayAddress,
} from '@/actions/shared/aave/addresses.js'
import { EmptyPositionError } from '@/core/error/errors.js'
import type { ApprovalMode } from '@/types/actions.js'
import type {
  AaveBorrowMarketConfig,
  AmountWeiOrMax,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'
import {
  buildErc20ApprovalTx,
  checkTokenAllowance,
  resolveErc20ApprovalAmount,
} from '@/utils/approve.js'

/**
 * Resolve `AmountWeiOrMax` to a wei amount. `max` returns `fallbackMax` (the
 * live balance) for projection; callers send `maxUint256` on-chain.
 */
export function resolveAaveAmount(
  amount: AmountWeiOrMax,
  fallbackMax: bigint,
): { amount: bigint; isMax: boolean } {
  if ('max' in amount) return { amount: fallbackMax, isMax: true }
  return { amount: amount.amountWei, isMax: false }
}

/**
 * Collateral-deposit transactions: native ETH via the WETH gateway (no
 * approval), an ERC-20 reserve via Pool.supply with an approval when needed.
 */
export async function buildAaveCollateralDeposit(
  client: PublicClient,
  config: AaveBorrowMarketConfig,
  amount: bigint,
  user: Address,
  approvalMode: ApprovalMode,
): Promise<{ txs: TransactionData[]; approvalsSkipped: boolean }> {
  if (config.aave.collateralUsesWethGateway) {
    return {
      txs: [encodeAaveDepositETH(config, amount, user)],
      approvalsSkipped: true,
    }
  }
  const allowance = await checkTokenAllowance({
    publicClient: client,
    token: config.aave.collateralReserve,
    owner: user,
    spender: requireAavePoolAddress(config.chainId),
  })
  const approvalTx = buildAavePoolApproval(
    config,
    config.aave.collateralReserve,
    amount,
    allowance,
    approvalMode,
  )
  const txs: TransactionData[] = []
  if (approvalTx) txs.push(approvalTx)
  txs.push(encodeAaveSupply(config, amount, user))
  return { txs, approvalsSkipped: approvalTx === undefined }
}

/**
 * Collateral-withdraw transactions. The native-ETH path withdraws via the WETH
 * gateway, which pulls the aToken, so it needs an aToken approval when the
 * allowance is short; the direct Pool.withdraw path needs none.
 */
export async function buildAaveCollateralWithdraw(
  client: PublicClient,
  config: AaveBorrowMarketConfig,
  amount: bigint,
  isMax: boolean,
  user: Address,
  approvalMode: ApprovalMode,
): Promise<TransactionData[]> {
  const onChainAmount = isMax ? maxUint256 : amount
  if (!config.aave.collateralUsesWethGateway) {
    return [encodeAaveWithdraw(config, onChainAmount, user)]
  }
  const gateway = requireAaveWethGatewayAddress(config.chainId)
  const { aToken } = await fetchAaveReserveTokens(client, config)
  const allowance = await checkTokenAllowance({
    publicClient: client,
    token: aToken,
    owner: user,
    spender: gateway,
  })
  const txs: TransactionData[] = []
  // Size the aToken approval to the real withdraw amount (live balance for a
  // max withdraw), never the `maxUint256` on-chain sentinel — otherwise exact
  // mode would leave the gateway a standing unlimited aToken allowance.
  if (allowance < amount) {
    txs.push(
      buildErc20ApprovalTx({
        assetAddress: aToken,
        spender: gateway,
        amount: resolveErc20ApprovalAmount(approvalMode, amount),
      }),
    )
  }
  txs.push(encodeAaveWithdrawETH(config, onChainAmount, user))
  return txs
}

/**
 * Repay leg (debt-reserve approval + Pool.repay) shared by repay and close. A
 * max repay sends `maxUint256` on-chain so Aave can clear interest accrued
 * after the quote, but sizes the approval to the live-debt snapshot — exact
 * mode never grants an unlimited debt-reserve allowance. (Tradeoff: if debt
 * accrues past the snapshot before execution the approval can fall a hair
 * short; quote expiry bounds the window.)
 * @returns Transactions, approval-skipped flag, and the resolved repay amount
 * (live debt for a max repay) for projection.
 * @throws EmptyPositionError when a max repay targets a zero-debt position.
 */
export async function buildAaveRepay(
  client: PublicClient,
  config: AaveBorrowMarketConfig,
  amount: AmountWeiOrMax,
  currentDebt: bigint,
  user: Address,
  approvalMode: ApprovalMode,
): Promise<{
  txs: TransactionData[]
  approvalsSkipped: boolean
  repayAmount: bigint
}> {
  const { amount: repayAmount, isMax } = resolveAaveAmount(amount, currentDebt)
  if (isMax && currentDebt === 0n) {
    throw new EmptyPositionError({ operation: 'repay' })
  }
  const onChainAmount = isMax ? maxUint256 : repayAmount
  const allowance = await checkTokenAllowance({
    publicClient: client,
    token: config.aave.debtReserve,
    owner: user,
    spender: requireAavePoolAddress(config.chainId),
  })
  const approvalTx = buildAavePoolApproval(
    config,
    config.aave.debtReserve,
    repayAmount,
    allowance,
    approvalMode,
  )
  const txs: TransactionData[] = []
  if (approvalTx) txs.push(approvalTx)
  txs.push(encodeAaveRepay(config, onChainAmount, user))
  return { txs, approvalsSkipped: approvalTx === undefined, repayAmount }
}
