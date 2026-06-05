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
 * Resolve an `AmountWeiOrMax` to a concrete wei amount. `{ max: true }`
 * resolves to `fallbackMax` (the live balance) for projection; the on-chain
 * call separately uses `maxUint256` so Aave clears dust precisely.
 */
export function resolveAaveAmount(
  amount: AmountWeiOrMax,
  fallbackMax: bigint,
): { amount: bigint; isMax: boolean } {
  if ('max' in amount) return { amount: fallbackMax, isMax: true }
  return { amount: amount.amountWei, isMax: false }
}

/**
 * Build the collateral-deposit transactions: native ETH routes through the
 * WETH gateway (no ERC-20 approval), an ERC-20 reserve uses Pool.supply with
 * an approval when the current allowance is insufficient.
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
 * Build the collateral-withdraw transactions. The native-ETH path withdraws
 * through the WETH gateway, which pulls the user's aToken, so it must be
 * preceded by an aToken approval to the gateway when the allowance is
 * insufficient. The direct Pool.withdraw path needs no approval.
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
  if (allowance < onChainAmount) {
    txs.push(
      buildErc20ApprovalTx({
        assetAddress: aToken,
        spender: gateway,
        amount: resolveErc20ApprovalAmount(approvalMode, onChainAmount),
      }),
    )
  }
  txs.push(encodeAaveWithdrawETH(config, onChainAmount, user))
  return txs
}

/**
 * Build the repay leg (debt-reserve approval + Pool.repay) shared by repay and
 * close. Approves the on-chain amount: a max repay sends `maxUint256` so Aave
 * clears principal plus interest accrued after the quote, which would exceed
 * an exact-debt approval and revert.
 * @returns The transactions, whether an approval was skipped, and the resolved
 * repay amount (live debt for a max repay) for position projection.
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
    onChainAmount,
    allowance,
    approvalMode,
  )
  const txs: TransactionData[] = []
  if (approvalTx) txs.push(approvalTx)
  txs.push(encodeAaveRepay(config, onChainAmount, user))
  return { txs, approvalsSkipped: approvalTx === undefined, repayAmount }
}
