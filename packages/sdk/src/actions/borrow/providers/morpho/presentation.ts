import type { AccrualPosition, Market } from '@morpho-org/blue-sdk'
import { formatUnits } from 'viem'

import {
  isVaultWrappedCollateral,
  liquidationBonusFromIncentive,
  morphoFractionOrNull,
  morphoWadToNumber,
} from '@/actions/borrow/providers/morpho/blue.js'
import type {
  BorrowAction,
  BorrowMarket,
  BorrowMarketConfig,
  BorrowMarketPosition,
  BorrowQuote,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

export function adaptMorphoBorrowMarket(
  config: BorrowMarketConfig,
  market: Market,
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
    borrowApy: morphoWadToNumber(market.borrowApy),
    liquidationBonus: liquidationBonusFromIncentive(
      market.params.liquidationIncentiveFactor,
    ),
    maxLtv: morphoWadToNumber(config.marketParams.lltv),
    healthBufferPct,
    totalBorrowed: market.totalBorrowAssets,
    totalCollateral: 0n,
  }
}

/**
 * Convert raw vault shares to underlying asset units given a share price
 * (the underlying-asset value of `1e18` shares, fetched once via
 * `convertToAssets(1e18)` in the same multicall as the position read).
 *
 * Returns shares unchanged when the collateral token is the underlying
 * asset itself (no vault wrapping). This keeps the unit tests' mocked
 * "asset == collateral token" fixtures behaving as before while letting
 * the demo's dUSDC vault collateral resolve to USDC value.
 */
function sharesToUnderlying(
  config: BorrowMarketConfig,
  shares: bigint,
  sharePrice: bigint,
): bigint {
  if (!isVaultWrappedCollateral(config)) return shares
  return (shares * sharePrice) / 10n ** 18n
}

export function adaptMorphoBorrowPosition(
  config: BorrowMarketConfig,
  position: AccrualPosition,
  sharePrice: bigint,
): BorrowMarketPosition {
  const hasDebt = position.borrowAssets > 0n
  const ltvFraction = hasDebt ? morphoFractionOrNull(position.ltv) : null
  const hfFraction = hasDebt
    ? morphoFractionOrNull(position.healthFactor)
    : null
  const liquidationPrice = position.liquidationPrice ?? 0n
  const collateralAmount = sharesToUnderlying(
    config,
    position.collateral,
    sharePrice,
  )
  return {
    marketId: {
      kind: config.kind,
      marketId: config.marketId,
      chainId: config.chainId,
    },
    collateralAsset: config.collateralAsset,
    collateralShares: position.collateral,
    // Vault shares are 18 decimals by MetaMorpho convention. When the
    // collateral is the asset itself (no wrapping) this still works
    // because `collateralShares === collateralAmount` in that case and
    // the asset decimals are used below for the user-facing format.
    collateralSharesFormatted: formatUnits(position.collateral, 18),
    collateralAmount,
    collateralAmountFormatted: formatUnits(
      collateralAmount,
      config.collateralAsset.metadata.decimals,
    ),
    borrowAsset: config.borrowAsset,
    borrowAmount: position.borrowAssets,
    borrowAmountFormatted: formatUnits(
      position.borrowAssets,
      config.borrowAsset.metadata.decimals,
    ),
    healthFactor: hfFraction,
    liquidationPrice,
    liquidationPriceFormatted: formatUnits(
      liquidationPrice,
      config.borrowAsset.metadata.decimals,
    ),
    borrowApy: morphoWadToNumber(position.market.borrowApy),
    liquidationBonus: liquidationBonusFromIncentive(
      position.market.params.liquidationIncentiveFactor,
    ),
    ltv: ltvFraction,
    maxLtv: morphoWadToNumber(config.marketParams.lltv),
  }
}

export function assembleMorphoBorrowQuote(args: {
  action: BorrowAction
  market: BorrowMarketConfig
  positionBefore: AccrualPosition
  positionAfter: AccrualPosition
  sharePrice: bigint
  transactions: TransactionData[]
  quoteAmounts: {
    borrowAmountRaw?: bigint
    collateralAmountRaw?: bigint
  }
  approvalsSkipped: boolean
  quoteExpirationSeconds: number
  healthBufferPct: number
}): BorrowQuote {
  const now = Math.floor(Date.now() / 1000)
  const hasBefore =
    args.positionBefore.collateral > 0n || args.positionBefore.borrowShares > 0n
  return {
    marketId: {
      kind: args.market.kind,
      marketId: args.market.marketId,
      chainId: args.market.chainId,
    },
    action: args.action,
    borrowAmountRaw: args.quoteAmounts.borrowAmountRaw,
    collateralAmountRaw: args.quoteAmounts.collateralAmountRaw,
    positionBefore: hasBefore
      ? adaptMorphoBorrowPosition(
          args.market,
          args.positionBefore,
          args.sharePrice,
        )
      : null,
    positionAfter: adaptMorphoBorrowPosition(
      args.market,
      args.positionAfter,
      args.sharePrice,
    ),
    fees: {
      borrowApy: morphoWadToNumber(args.positionAfter.market.borrowApy),
      liquidationBonus: liquidationBonusFromIncentive(
        args.positionAfter.market.params.liquidationIncentiveFactor,
      ),
    },
    safeCeilingLtv:
      morphoWadToNumber(args.market.marketParams.lltv) *
      (1 - args.healthBufferPct),
    execution: {
      transactions: args.transactions,
      approvalsSkipped: args.approvalsSkipped,
    },
    provider: 'morpho',
    quotedAt: now,
    expiresAt: now + args.quoteExpirationSeconds,
  }
}
