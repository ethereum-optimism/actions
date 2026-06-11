import { type Address, formatUnits } from 'viem'

import { assembleBorrowQuote } from '@/actions/borrow/core/quote.js'
import type {
  AaveBorrowMarketConfig,
  BorrowAction,
  BorrowMarket,
  BorrowMarketPosition,
  BorrowQuote,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

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

/**
 * Liquidation bonus as a decimal (e.g. 10500 bps -> 0.05). Aave encodes the
 * bonus as a multiplier over 100%, so subtract one whole unit. Clamped at 0
 * for a misconfigured or frozen reserve that reports a sub-100% (or zero) bonus.
 */
export function liquidationBonusFraction(bonusBps: bigint): number {
  return bonusBps > BPS ? bpsToFraction(bonusBps - BPS) : 0
}

/** Convert a 1e18-scaled value (Aave health factor) to a decimal fraction. */
export function wad18ToNumber(wad: bigint): number {
  return Number((wad * 1_000_000n) / 10n ** 18n) / 1_000_000
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
  /**
   * Collateral reserve liquidation threshold (bps) — same semantics as
   * `AaveMarketState.liquidationThresholdBps`, but falls back to the aggregate
   * `getUserAccountData` threshold when the reserve config reads zero.
   */
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
 * health factor from oracle prices. Pure function; does not read on-chain state.
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

export function toAaveBorrowMarket(
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
    liquidationBonus: liquidationBonusFraction(state.liquidationBonusBps),
    maxLtv: bpsToFraction(state.liquidationThresholdBps),
    healthBufferPct,
    totalBorrowed: state.totalBorrowed,
    totalCollateral: state.totalCollateral,
  }
}

export function toAaveBorrowPosition(
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
    liquidationBonus: liquidationBonusFraction(state.liquidationBonusBps),
    ltv,
    maxLtv: bpsToFraction(state.liquidationThresholdBps),
  }
}

export interface AssembleAaveQuoteArgs {
  action: BorrowAction
  market: AaveBorrowMarketConfig
  positionBefore: AavePositionState
  positionAfter: AavePositionState
  transactions: TransactionData[]
  quoteAmounts: { borrowAmountRaw?: bigint; collateralAmountRaw?: bigint }
  approvalsSkipped: boolean
  recipient: Address
  quoteExpirationSeconds: number
  healthBufferPct: number
}

/**
 * Assemble a `BorrowQuote` from a projected before/after Aave position. The
 * caller supplies the resolved settings (`quoteExpirationSeconds`,
 * `healthBufferPct`) so this stays a pure presentation function.
 */
export function assembleAaveBorrowQuote(
  args: AssembleAaveQuoteArgs,
): BorrowQuote {
  const hasBefore =
    args.positionBefore.collateralAmount > 0n ||
    args.positionBefore.debtAmount > 0n
  return assembleBorrowQuote({
    provider: 'aave',
    action: args.action,
    recipient: args.recipient,
    positionBefore: hasBefore
      ? toAaveBorrowPosition(args.market, args.positionBefore)
      : null,
    positionAfter: toAaveBorrowPosition(args.market, args.positionAfter),
    quoteAmounts: args.quoteAmounts,
    transactions: args.transactions,
    approvalsSkipped: args.approvalsSkipped,
    healthBufferPct: args.healthBufferPct,
    quoteExpirationSeconds: args.quoteExpirationSeconds,
  })
}
