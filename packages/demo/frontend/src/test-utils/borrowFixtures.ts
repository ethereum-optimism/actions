import { createElement, type ReactNode } from 'react'
import type { Asset, BorrowQuote } from '@eth-optimism/actions-sdk'
import { BorrowProviderContext } from '@/contexts/BorrowProviderContext'
import type { UseBorrowProviderReturn } from '@/hooks/useBorrowProvider'
import type { BorrowPosition, MarketPosition } from '@/types/market'

export const usdcAsset: Asset = {
  type: 'erc20',
  address: { 84532: '0xcccccccccccccccccccccccccccccccccccccccc' },
  metadata: { decimals: 6, name: 'USD Coin', symbol: 'USDC' },
}

export const opAsset: Asset = {
  type: 'erc20',
  address: { 84532: '0x4200000000000000000000000000000000000042' },
  metadata: { decimals: 18, name: 'Optimism', symbol: 'OP' },
}

const DEFAULT_POSITION = {
  marketId: {
    kind: 'morpho-blue',
    marketId: '0x4444444444444444444444444444444444444444',
    chainId: 84532,
  },
  collateralAsset: usdcAsset,
  borrowAsset: opAsset,
  collateralAmount: 100n,
  collateralAmountFormatted: '100',
  collateralShares: 100n,
  borrowAmount: 0n,
  borrowAmountFormatted: '0',
  healthFactor: Number.POSITIVE_INFINITY,
  liquidationPrice: 0n,
  liquidationPriceFormatted: '0',
  borrowApy: 0.05,
  liquidationBonus: 0.01,
  ltv: null,
  maxLtv: 0.86,
} as unknown as BorrowPosition

/**
 * A complete enriched `BorrowPosition` (SDK fields plus the frontend-derived
 * collateral amount); pass only the fields a test asserts on.
 */
export function buildBorrowMarketPosition(
  overrides: Partial<BorrowPosition> = {},
): BorrowPosition {
  return { ...DEFAULT_POSITION, ...overrides } as BorrowPosition
}

const DEFAULT_LEND_POSITION = {
  marketName: 'Gauntlet USDC',
  marketLogo: 'https://example.test/gauntlet.svg',
  networkName: 'Base Sepolia',
  networkLogo: 'https://example.test/base.svg',
  asset: usdcAsset,
  assetLogo: 'https://example.test/usdc.svg',
  apy: 0.045,
  depositedAmount: '100.00',
  directDepositedAmount: '100.00',
  depositedShares: '100.00',
  depositedSharesRaw: 100_000_000n,
  directDepositedShares: '100.00',
  directDepositedSharesRaw: 100_000_000n,
  pledgedCollateralAmount: null,
  isLoadingApy: false,
  isLoadingPosition: false,
  marketId: {
    address: '0x0000000000000000000000000000000000000001',
    chainId: 84532,
  },
  provider: 'morpho',
} as unknown as MarketPosition

/** A complete lend `MarketPosition`; pass only the fields a test asserts on. */
export function buildMarketPosition(
  overrides: Partial<MarketPosition> = {},
): MarketPosition {
  return { ...DEFAULT_LEND_POSITION, ...overrides } as MarketPosition
}

/** A complete `BorrowQuote` (defaults to an `open` against the default position). */
export function buildBorrowQuote(
  overrides: Partial<BorrowQuote> = {},
): BorrowQuote {
  const positionAfter = buildBorrowMarketPosition()
  return {
    marketId: positionAfter.marketId,
    action: 'open',
    positionBefore: null,
    positionAfter,
    fees: { borrowApy: 0.05, liquidationBonus: 0.05 },
    safeCeilingLtv: 0.81,
    execution: { transactions: [] },
    provider: 'morpho',
    quotedAt: 0,
    expiresAt: 0,
    ...overrides,
  } as unknown as BorrowQuote
}

/** Wraps children in a BorrowProviderContext carrying the given stub value. */
export function makeBorrowContextWrapper(ctx: UseBorrowProviderReturn | null) {
  return ({ children }: { children: ReactNode }) =>
    createElement(
      BorrowProviderContext.Provider,
      { value: ctx },
      children as ReactNode,
    )
}
