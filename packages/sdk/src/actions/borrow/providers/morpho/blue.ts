import { Market, MarketParams } from '@morpho-org/blue-sdk'
import { blueAbi } from '@morpho-org/blue-sdk-viem'
import { type Address, encodeFunctionData, type Hex, maxUint256 } from 'viem'

import { getMorphoContracts } from '@/actions/shared/morpho/contracts.js'
import { ProtocolContractsNotConfiguredError } from '@/core/error/errors.js'
import type { ApprovalMode } from '@/types/actions.js'
import type { BorrowMarketConfig } from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'
import {
  buildErc20ApprovalTx,
  resolveErc20ApprovalAmount,
} from '@/utils/approve.js'

export function requireMorphoBlueAddress(chainId: number): Address {
  const contracts = getMorphoContracts(chainId)
  if (!contracts) {
    throw new ProtocolContractsNotConfiguredError({
      protocol: 'Morpho Blue',
      chainId,
    })
  }
  return contracts.morphoBlue
}

/**
 * Compose Morpho's `Market` from the raw `market()` tuple plus oracle price.
 * @description `blueAbi.market(id)` returns
 * `[totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee]`
 * as uint128/uint128/uint128/uint128/uint128/uint128.
 */
export function buildMorphoMarket(
  config: BorrowMarketConfig,
  marketTuple: readonly [bigint, bigint, bigint, bigint, bigint, bigint],
  price: bigint,
): Market {
  const [
    totalSupplyAssets,
    totalSupplyShares,
    totalBorrowAssets,
    totalBorrowShares,
    lastUpdate,
    fee,
  ] = marketTuple
  return new Market({
    params: new MarketParams({
      loanToken: config.marketParams.loanToken,
      collateralToken: config.marketParams.collateralToken,
      oracle: config.marketParams.oracle,
      irm: config.marketParams.irm,
      lltv: config.marketParams.lltv,
    }),
    totalSupplyAssets,
    totalSupplyShares,
    totalBorrowAssets,
    totalBorrowShares,
    lastUpdate,
    fee,
    price,
  })
}

export function encodeMorphoSupplyCollateral(
  config: BorrowMarketConfig,
  assets: bigint,
  onBehalf: Address,
): TransactionData {
  return {
    to: requireMorphoBlueAddress(config.chainId),
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: 'supplyCollateral',
      args: [config.marketParams, assets, onBehalf, '0x'],
    }),
    value: 0n,
  }
}

export function encodeMorphoBorrow(
  config: BorrowMarketConfig,
  assets: bigint,
  shares: bigint,
  onBehalf: Address,
  receiver: Address,
): TransactionData {
  return {
    to: requireMorphoBlueAddress(config.chainId),
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: 'borrow',
      args: [config.marketParams, assets, shares, onBehalf, receiver],
    }),
    value: 0n,
  }
}

export function encodeMorphoRepay(
  config: BorrowMarketConfig,
  assets: bigint,
  shares: bigint,
  onBehalf: Address,
): TransactionData {
  return {
    to: requireMorphoBlueAddress(config.chainId),
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: 'repay',
      args: [config.marketParams, assets, shares, onBehalf, '0x'],
    }),
    value: 0n,
  }
}

export function encodeMorphoWithdrawCollateral(
  config: BorrowMarketConfig,
  assets: bigint,
  onBehalf: Address,
  receiver: Address,
): TransactionData {
  return {
    to: requireMorphoBlueAddress(config.chainId),
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: 'withdrawCollateral',
      args: [config.marketParams, assets, onBehalf, receiver],
    }),
    value: 0n,
  }
}

export function buildMorphoCollateralApproval(
  config: BorrowMarketConfig,
  amountWei: bigint | undefined,
  currentAllowance: bigint,
  mode: ApprovalMode,
): TransactionData | undefined {
  if (amountWei === undefined || amountWei === 0n) return undefined
  if (currentAllowance >= amountWei) return undefined
  const spender = requireMorphoBlueAddress(config.chainId)
  return buildErc20ApprovalTx(
    config.marketParams.collateralToken,
    spender,
    resolveErc20ApprovalAmount(mode, amountWei),
  )
}

export function buildMorphoLoanApproval(
  config: BorrowMarketConfig,
  amountWei: bigint,
  currentAllowance: bigint,
  mode: ApprovalMode,
): TransactionData | undefined {
  if (amountWei === 0n) return undefined
  if (currentAllowance >= amountWei) return undefined
  const spender = requireMorphoBlueAddress(config.chainId)
  return buildErc20ApprovalTx(
    config.marketParams.loanToken,
    spender,
    resolveErc20ApprovalAmount(mode, amountWei),
  )
}

export function buildMorphoMaxLoanApproval(
  config: BorrowMarketConfig,
  currentAllowance: bigint,
): TransactionData | undefined {
  if (currentAllowance === maxUint256) return undefined
  const spender = requireMorphoBlueAddress(config.chainId)
  return buildErc20ApprovalTx(
    config.marketParams.loanToken,
    spender,
    maxUint256,
  )
}

/**
 * Convert a WAD-scaled bigint to a JS number.
 * @description WAD = `1e18`, the DeFi convention (originated at MakerDAO)
 * for fixed-point math at 18 decimals. Morpho stores percentages, rates,
 * and prices as WAD-scaled bigints: `1e18` = `1.0`, `5e16` = `0.05` (5%),
 * `8.6e17` = `0.86` (86% LTV). This helper divides by `1e18` to recover
 * the JS-number representation.
 */
export function morphoWadToNumber(value: bigint): number {
  return Number(value) / Number(10n ** 18n)
}

export function morphoFractionOrNull(
  value: bigint | null | undefined,
): number | null {
  if (value === null || value === undefined) return null
  return morphoWadToNumber(value)
}

/**
 * Morpho's `liquidationIncentiveFactor` is `WAD + bonus`. Subtract WAD to
 * recover the bonus fraction (e.g., `1.05e18 -> 0.05`).
 */
export function liquidationBonusFromIncentive(factor: bigint): number {
  if (factor <= 10n ** 18n) return 0
  return morphoWadToNumber(factor - 10n ** 18n)
}

export type { Hex }
