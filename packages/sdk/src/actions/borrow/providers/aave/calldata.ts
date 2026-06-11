import { type Address, encodeFunctionData } from 'viem'

import { POOL_ABI, WETH_GATEWAY_ABI } from '@/actions/shared/aave/abis/pool.js'
import {
  requireAavePoolAddress,
  requireAaveWethGatewayAddress,
} from '@/actions/shared/aave/addresses.js'
import type { AaveBorrowMarketConfig } from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

/** Aave interest rate mode: 2 = variable (the only mode this provider supports). */
const VARIABLE_RATE_MODE = 2n

function requirePool(config: AaveBorrowMarketConfig): Address {
  return requireAavePoolAddress(config.chainId)
}

/** `Pool.borrow(debtAsset, amount, 2, 0, onBehalfOf)`. */
export function encodeAaveBorrow(
  config: AaveBorrowMarketConfig,
  amount: bigint,
  onBehalfOf: Address,
): TransactionData {
  return {
    to: requirePool(config),
    data: encodeFunctionData({
      abi: POOL_ABI,
      functionName: 'borrow',
      args: [
        config.aave.debtReserve,
        amount,
        VARIABLE_RATE_MODE,
        0,
        onBehalfOf,
      ],
    }),
    value: 0n,
  }
}

/**
 * `Pool.repay(debtAsset, amount, 2, onBehalfOf)`. For a full repay, pass
 * `maxUint256` so Aave clears principal plus accrued interest on-chain.
 */
export function encodeAaveRepay(
  config: AaveBorrowMarketConfig,
  amount: bigint,
  onBehalfOf: Address,
): TransactionData {
  return {
    to: requirePool(config),
    data: encodeFunctionData({
      abi: POOL_ABI,
      functionName: 'repay',
      args: [config.aave.debtReserve, amount, VARIABLE_RATE_MODE, onBehalfOf],
    }),
    value: 0n,
  }
}

/** `Pool.supply(collateralAsset, amount, onBehalfOf, 0)`. */
export function encodeAaveSupply(
  config: AaveBorrowMarketConfig,
  amount: bigint,
  onBehalfOf: Address,
): TransactionData {
  return {
    to: requirePool(config),
    data: encodeFunctionData({
      abi: POOL_ABI,
      functionName: 'supply',
      args: [config.aave.collateralReserve, amount, onBehalfOf, 0],
    }),
    value: 0n,
  }
}

/** `Pool.withdraw(collateralAsset, amount, to)`. */
export function encodeAaveWithdraw(
  config: AaveBorrowMarketConfig,
  amount: bigint,
  to: Address,
): TransactionData {
  return {
    to: requirePool(config),
    data: encodeFunctionData({
      abi: POOL_ABI,
      functionName: 'withdraw',
      args: [config.aave.collateralReserve, amount, to],
    }),
    value: 0n,
  }
}

/** Native-ETH collateral deposit via the WETH gateway (`msg.value` carries ETH). */
export function encodeAaveDepositETH(
  config: AaveBorrowMarketConfig,
  amount: bigint,
  onBehalfOf: Address,
): TransactionData {
  const gateway = requireAaveWethGatewayAddress(config.chainId)
  const pool = requirePool(config)
  return {
    to: gateway,
    data: encodeFunctionData({
      abi: WETH_GATEWAY_ABI,
      functionName: 'depositETH',
      args: [pool, onBehalfOf, 0],
    }),
    value: amount,
  }
}

/** Native-ETH collateral withdrawal via the WETH gateway. */
export function encodeAaveWithdrawETH(
  config: AaveBorrowMarketConfig,
  amount: bigint,
  to: Address,
): TransactionData {
  const gateway = requireAaveWethGatewayAddress(config.chainId)
  const pool = requirePool(config)
  return {
    to: gateway,
    data: encodeFunctionData({
      abi: WETH_GATEWAY_ABI,
      functionName: 'withdrawETH',
      args: [pool, amount, to],
    }),
    value: 0n,
  }
}
