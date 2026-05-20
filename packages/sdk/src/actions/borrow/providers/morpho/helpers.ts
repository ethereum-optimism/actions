import { Market, MarketParams } from '@morpho-org/blue-sdk'
import { blueAbi } from '@morpho-org/blue-sdk-viem'
import { type Address, encodeFunctionData, type Hex } from 'viem'

import { marketIdMatches } from '@/actions/borrow/core/marketId.js'
import { getMorphoContracts } from '@/actions/shared/morpho/contracts.js'
import {
  computeMorphoMarketId,
  verifyMorphoMarketId,
} from '@/actions/shared/morpho/marketParams.js'
import {
  BorrowMarketParamsMismatchError,
  MarketNotAllowedError,
  ProtocolContractsNotConfiguredError,
} from '@/core/error/errors.js'
import type {
  BorrowMarketConfig,
  BorrowMarketId,
  MorphoMarketParams,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

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

/**
 * Convert a `MorphoMarketParams` object to the tuple shape `blueAbi` expects.
 * Destructured by name so a future ABI re-ordering surfaces as a TypeScript
 * error rather than a silent calldata bug.
 */
export function morphoMarketParamsTuple(params: MorphoMarketParams): {
  loanToken: Address
  collateralToken: Address
  oracle: Address
  irm: Address
  lltv: bigint
} {
  return {
    loanToken: params.loanToken,
    collateralToken: params.collateralToken,
    oracle: params.oracle,
    irm: params.irm,
    lltv: params.lltv,
  }
}

export function buildMorphoTx(
  config: BorrowMarketConfig,
  functionName: 'supplyCollateral' | 'borrow' | 'repay' | 'withdrawCollateral',
  args: readonly unknown[],
): TransactionData {
  return {
    to: requireMorphoBlueAddress(config.chainId),
    data: encodeFunctionData({
      abi: blueAbi,
      functionName,
      // viem's typings tighten args based on functionName; cast at the
      // call site rather than threading per-method generics through.
      args: args as never,
    }),
    value: 0n,
  }
}

export function encodeMorphoSupplyCollateral(
  config: BorrowMarketConfig,
  assets: bigint,
  onBehalf: Address,
): TransactionData {
  return buildMorphoTx(config, 'supplyCollateral', [
    morphoMarketParamsTuple(config.marketParams),
    assets,
    onBehalf,
    '0x',
  ])
}

export function encodeMorphoBorrow(
  config: BorrowMarketConfig,
  assets: bigint,
  shares: bigint,
  onBehalf: Address,
  receiver: Address,
): TransactionData {
  return buildMorphoTx(config, 'borrow', [
    morphoMarketParamsTuple(config.marketParams),
    assets,
    shares,
    onBehalf,
    receiver,
  ])
}

export function encodeMorphoRepay(
  config: BorrowMarketConfig,
  assets: bigint,
  shares: bigint,
  onBehalf: Address,
): TransactionData {
  return buildMorphoTx(config, 'repay', [
    morphoMarketParamsTuple(config.marketParams),
    assets,
    shares,
    onBehalf,
    '0x',
  ])
}

export function encodeMorphoWithdrawCollateral(
  config: BorrowMarketConfig,
  assets: bigint,
  onBehalf: Address,
  receiver: Address,
): TransactionData {
  return buildMorphoTx(config, 'withdrawCollateral', [
    morphoMarketParamsTuple(config.marketParams),
    assets,
    onBehalf,
    receiver,
  ])
}

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
 * recover the bonus fraction (e.g., `1.05e18 → 0.05`).
 */
export function liquidationBonusFromIncentive(factor: bigint): number {
  if (factor <= 10n ** 18n) return 0
  return morphoWadToNumber(factor - 10n ** 18n)
}

export function verifyMorphoAllowlistMarketIds(
  allowlist: BorrowMarketConfig[] | undefined,
): void {
  if (!allowlist?.length) return
  for (const market of allowlist) {
    if (market.kind !== 'morpho-blue') continue
    if (!verifyMorphoMarketId(market.marketId, market.marketParams)) {
      throw new BorrowMarketParamsMismatchError({
        marketId: market.marketId,
        computedMarketId: computeMorphoMarketId(market.marketParams),
      })
    }
  }
}

export function requireMorphoAllowlistMarket(
  allowlist: BorrowMarketConfig[] | undefined,
  marketId: BorrowMarketId,
): BorrowMarketConfig {
  const match = (allowlist ?? []).find((market) =>
    marketIdMatches(market, marketId),
  )
  if (!match) {
    throw new MarketNotAllowedError({
      chainId: marketId.chainId,
      address: marketId.marketId,
      reason: 'Market not in MorphoBorrowProvider allowlist',
    })
  }
  return match
}

export type { Hex }
