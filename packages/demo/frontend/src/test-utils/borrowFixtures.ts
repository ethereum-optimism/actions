import { createElement, type ReactNode } from 'react'
import type { Asset, BorrowMarketPosition } from '@eth-optimism/actions-sdk'
import { BorrowProviderContext } from '@/contexts/BorrowProviderContext'
import type { UseBorrowProviderReturn } from '@/hooks/useBorrowProvider'

const DEFAULT_COLLATERAL: Asset = {
  type: 'erc20',
  address: { 84532: '0xcccccccccccccccccccccccccccccccccccccccc' },
  metadata: { decimals: 6, name: 'USD Coin', symbol: 'USDC' },
}

const DEFAULT_BORROW: Asset = {
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
  collateralAsset: DEFAULT_COLLATERAL,
  borrowAsset: DEFAULT_BORROW,
  collateralAmount: 100n,
  collateralAmountFormatted: '100',
  collateralShares: 100n,
  collateralSharesFormatted: '100',
  borrowAmount: 0n,
  borrowAmountFormatted: '0',
  healthFactor: Number.POSITIVE_INFINITY,
  liquidationPrice: 0n,
  liquidationPriceFormatted: '0',
  borrowApy: 0.05,
  liquidationBonus: 0.01,
  ltv: null,
  maxLtv: 0.86,
} as unknown as BorrowMarketPosition

/** A complete `BorrowMarketPosition`; pass only the fields a test asserts on. */
export function buildBorrowMarketPosition(
  overrides: Partial<BorrowMarketPosition> = {},
): BorrowMarketPosition {
  return { ...DEFAULT_POSITION, ...overrides } as BorrowMarketPosition
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
