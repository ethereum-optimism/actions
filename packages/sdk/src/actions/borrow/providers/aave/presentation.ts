import { formatUnits } from 'viem'

import type {
  AaveBorrowMarketConfig,
  BorrowMarket,
  BorrowMarketPosition,
} from '@/types/borrow/index.js'

/** Aave stores interest rates in ray (27 decimals). */
const RAY = 10n ** 27n
/** Aave stores LTV / threshold / bonus in basis points (1e4 = 100%). */
const BPS = 10000n

/** Convert a ray-scaled rate (APR) to a decimal fraction (e.g. 0.035). */
export function rayToFraction(ray: bigint): number {
  // Scale to 1e6 fixed point before going to Number to keep precision.
  return Number((ray * 1_000_000n) / RAY) / 1_000_000
}

/** Convert a basis-point value to a decimal fraction (e.g. 8250 -> 0.825). */
export function bpsToFraction(bps: bigint): number {
  return Number(bps) / Number(BPS)
}

/** Convert a 1e18-scaled value (Aave health factor) to a decimal fraction. */
export function wad18ToNumber(wad: bigint): number {
  return Number((wad * 1_000_000n) / 10n ** 18n) / 1_000_000
}

/**
 * Decode the packed Aave reserve `configuration.data` bitmap.
 * @description Bits 0-15 LTV, 16-31 liquidation threshold, 32-47 liquidation
 * bonus, 48-55 decimals — all in basis points except decimals. Kept here next
 * to its only consumers; promote to a shared module if a second caller appears.
 */
export function decodeReserveConfig(data: bigint): {
  ltvBps: bigint
  liquidationThresholdBps: bigint
  liquidationBonusBps: bigint
  decimals: number
} {
  return {
    ltvBps: data & 0xffffn,
    liquidationThresholdBps: (data >> 16n) & 0xffffn,
    liquidationBonusBps: (data >> 32n) & 0xffffn,
    decimals: Number((data >> 48n) & 0xffn),
  }
}

/**
 * Liquidation price of the collateral in loan-asset units for the synthetic
 * single-pair model. Liquidation occurs when
 * `collateral * price * liquidationThreshold == debt`, so
 * `price = debt / (collateral * liquidationThreshold)`. Returns the price
 * scaled to the loan asset's decimals; `0n` when there is no debt or
 * collateral (no finite liquidation price).
 */
export function deriveLiquidationPrice(params: {
  debtAmount: bigint
  collateralAmount: bigint
  liquidationThresholdBps: bigint
  collateralDecimals: number
}): bigint {
  if (
    params.debtAmount === 0n ||
    params.collateralAmount === 0n ||
    params.liquidationThresholdBps === 0n
  ) {
    return 0n
  }
  return (
    (params.debtAmount * 10n ** BigInt(params.collateralDecimals) * BPS) /
    (params.collateralAmount * params.liquidationThresholdBps)
  )
}

/** State read for an Aave borrow market (reserve-level). */
export interface AaveMarketState {
  /** Debt reserve `currentVariableBorrowRate` (ray). */
  variableBorrowRateRay: bigint
  /** Collateral reserve liquidation threshold (bps). */
  liquidationThresholdBps: bigint
  /** Collateral reserve liquidation bonus (bps, e.g. 10500 = 5% bonus). */
  liquidationBonusBps: bigint
  /** Total variable debt outstanding for the debt reserve (wei). */
  totalBorrowed: bigint
  /** Total collateral supplied for the collateral reserve (wei). */
  totalCollateral: bigint
}

/** State read for a wallet's Aave position in the synthetic pair. */
export interface AavePositionState {
  /** aToken balance of the collateral reserve (collateral asset wei). */
  collateralAmount: bigint
  /** Variable debt token balance of the debt reserve (loan asset wei). */
  debtAmount: bigint
  /** Aggregate health factor from `getUserAccountData` (1e18 scaled). */
  healthFactorWad: bigint
  /** Aggregate current liquidation threshold from `getUserAccountData` (bps). */
  liquidationThresholdBps: bigint
  /** Collateral reserve liquidation bonus (bps). */
  liquidationBonusBps: bigint
  /** Debt reserve `currentVariableBorrowRate` (ray). */
  variableBorrowRateRay: bigint
  /** Aggregate collateral value in the pool base currency. */
  totalCollateralBase: bigint
  /** Aggregate debt value in the pool base currency. */
  totalDebtBase: bigint
}

/** Base-currency prices (USD, oracle scale) for the pair's two reserves. */
export interface AaveReservePrices {
  collateralPrice: bigint
  debtPrice: bigint
}

/**
 * Project the position that results from a borrow action by adjusting the
 * collateral/debt amounts and recomputing the base-currency aggregates and
 * health factor from oracle prices. Pure — does not read on-chain state.
 * Deltas are signed (borrow/deposit positive, repay/withdraw negative) and
 * clamped at zero.
 */
export function projectAavePositionState(
  current: AavePositionState,
  prices: AaveReservePrices,
  delta: { collateralDelta: bigint; debtDelta: bigint },
  decimals: { collateral: number; debt: number },
): AavePositionState {
  const collateralAmount = max0(
    current.collateralAmount + delta.collateralDelta,
  )
  const debtAmount = max0(current.debtAmount + delta.debtDelta)
  const collateralBase =
    (collateralAmount * prices.collateralPrice) /
    10n ** BigInt(decimals.collateral)
  const debtBase =
    (debtAmount * prices.debtPrice) / 10n ** BigInt(decimals.debt)
  const healthFactorWad =
    debtBase > 0n
      ? (collateralBase * current.liquidationThresholdBps * 10n ** 18n) /
        (debtBase * BPS)
      : 0n
  return {
    ...current,
    collateralAmount,
    debtAmount,
    healthFactorWad,
    totalCollateralBase: collateralBase,
    totalDebtBase: debtBase,
  }
}

function max0(value: bigint): bigint {
  return value < 0n ? 0n : value
}

export function adaptAaveBorrowMarket(
  config: AaveBorrowMarketConfig,
  state: AaveMarketState,
  healthBufferPct: number,
): BorrowMarket {
  return {
    marketId: {
      kind: config.kind,
      marketId: config.marketId,
      chainId: config.chainId,
    },
    name: config.name,
    collateralAsset: config.collateralAsset,
    borrowAsset: config.borrowAsset,
    borrowApy: rayToFraction(state.variableBorrowRateRay),
    liquidationBonus: bpsToFraction(state.liquidationBonusBps - BPS),
    maxLtv: bpsToFraction(state.liquidationThresholdBps),
    healthBufferPct,
    totalBorrowed: state.totalBorrowed,
    totalCollateral: state.totalCollateral,
  }
}

export function adaptAaveBorrowPosition(
  config: AaveBorrowMarketConfig,
  state: AavePositionState,
): BorrowMarketPosition {
  const hasDebt = state.debtAmount > 0n
  const liquidationPrice = deriveLiquidationPrice({
    debtAmount: state.debtAmount,
    collateralAmount: state.collateralAmount,
    liquidationThresholdBps: state.liquidationThresholdBps,
    collateralDecimals: config.collateralAsset.metadata.decimals,
  })
  const ltv =
    hasDebt && state.totalCollateralBase > 0n
      ? Number((state.totalDebtBase * 1_000_000n) / state.totalCollateralBase) /
        1_000_000
      : null
  return {
    marketId: {
      kind: config.kind,
      marketId: config.marketId,
      chainId: config.chainId,
    },
    collateralAsset: config.collateralAsset,
    // Aave aTokens rebase 1:1 with the underlying, so shares == amount.
    collateralShares: state.collateralAmount,
    collateralSharesFormatted: formatUnits(
      state.collateralAmount,
      config.collateralAsset.metadata.decimals,
    ),
    collateralAmount: state.collateralAmount,
    collateralAmountFormatted: formatUnits(
      state.collateralAmount,
      config.collateralAsset.metadata.decimals,
    ),
    borrowAsset: config.borrowAsset,
    borrowAmount: state.debtAmount,
    borrowAmountFormatted: formatUnits(
      state.debtAmount,
      config.borrowAsset.metadata.decimals,
    ),
    healthFactor: hasDebt ? wad18ToNumber(state.healthFactorWad) : null,
    liquidationPrice,
    liquidationPriceFormatted: formatUnits(
      liquidationPrice,
      config.borrowAsset.metadata.decimals,
    ),
    borrowApy: rayToFraction(state.variableBorrowRateRay),
    liquidationBonus: bpsToFraction(state.liquidationBonusBps - BPS),
    ltv,
    maxLtv: bpsToFraction(state.liquidationThresholdBps),
  }
}
