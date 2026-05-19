import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createElement, type ReactNode } from 'react'
import type {
  Asset,
  BorrowMarketPosition,
  SupportedChainId,
} from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import { BorrowProviderContext } from '@/contexts/BorrowProviderContext'
import type { UseBorrowProviderReturn } from '@/hooks/useBorrowProvider'
import { useCollateralStatus } from '@/hooks/useCollateralStatus'

const CHAIN_A = 84532 as SupportedChainId
const CHAIN_B = 11155420 as SupportedChainId
const ASSET_ADDRESS = '0x3333333333333333333333333333333333333333' as Address
const COLL_ADDRESS = '0xcccccccccccccccccccccccccccccccccccccccc' as Address
const MARKET_ID = '0x4444444444444444444444444444444444444444' as Address

const usdcOnChainA: Asset = {
  address: { [CHAIN_A]: ASSET_ADDRESS },
  metadata: { decimals: 6, name: 'USD Coin', symbol: 'USDC' },
  type: 'erc20',
}

const usdcOnChainB: Asset = {
  address: { [CHAIN_B]: ASSET_ADDRESS },
  metadata: { decimals: 6, name: 'USD Coin', symbol: 'USDC' },
  type: 'erc20',
}

function buildPosition(chainId: SupportedChainId): BorrowMarketPosition {
  return {
    marketId: { kind: 'morpho-blue', marketId: MARKET_ID, chainId },
    collateralAsset: {
      address: { [chainId]: COLL_ADDRESS },
      metadata: { decimals: 6, name: 'USD Coin', symbol: 'USDC' },
      type: 'erc20',
    } as Asset,
    borrowAsset: usdcOnChainA,
    collateralAmount: 100n,
    collateralAmountFormatted: '100',
    collateralShares: 100n,
    collateralSharesFormatted: '100',
    borrowAmount: 0n,
    borrowAmountFormatted: '0',
    healthFactor: Number.POSITIVE_INFINITY,
    liquidationPrice: 0n,
    borrowApy: 0.05,
    liquidationBonus: 0.01,
    ltv: null,
    maxLtv: 0.86,
  } as BorrowMarketPosition
}

function buildCtx(
  positions: readonly BorrowMarketPosition[],
  isInitialLoad = false,
): UseBorrowProviderReturn {
  return {
    borrowPositions: positions,
    isInitialLoad,
  } as unknown as UseBorrowProviderReturn
}

function withCtx(ctx: UseBorrowProviderReturn | null) {
  return ({ children }: { children: ReactNode }) =>
    createElement(
      BorrowProviderContext.Provider,
      { value: ctx },
      children as ReactNode,
    )
}

describe('useCollateralStatus', () => {
  it('returns EMPTY when no borrow context is present', () => {
    const { result } = renderHook(() => useCollateralStatus(usdcOnChainA))
    expect(result.current.isPledged).toBe(false)
    expect(result.current.positions).toEqual([])
  })

  it('returns EMPTY while the borrow provider is in initial load', () => {
    const ctx = buildCtx([buildPosition(CHAIN_A)], true)
    const { result } = renderHook(() => useCollateralStatus(usdcOnChainA), {
      wrapper: withCtx(ctx),
    })
    expect(result.current.isPledged).toBe(false)
  })

  it('matches a position by (symbol, chainId) when the asset map contains the chain', () => {
    const ctx = buildCtx([buildPosition(CHAIN_A)])
    const { result } = renderHook(() => useCollateralStatus(usdcOnChainA), {
      wrapper: withCtx(ctx),
    })
    expect(result.current.isPledged).toBe(true)
    expect(result.current.positions).toHaveLength(1)
  })

  it('does not match when the position chainId is absent from the asset map', () => {
    // Asset only deployed on chain A; the position is on chain B.
    const ctx = buildCtx([buildPosition(CHAIN_B)])
    const { result } = renderHook(() => useCollateralStatus(usdcOnChainA), {
      wrapper: withCtx(ctx),
    })
    expect(result.current.isPledged).toBe(false)
  })

  it('does not match a different symbol on the same chain', () => {
    const ctx = buildCtx([buildPosition(CHAIN_A)])
    const usdtOnChainA: Asset = {
      ...usdcOnChainA,
      metadata: { decimals: 6, name: 'Tether', symbol: 'USDT' },
    }
    const { result } = renderHook(() => useCollateralStatus(usdtOnChainA), {
      wrapper: withCtx(ctx),
    })
    expect(result.current.isPledged).toBe(false)
  })

  it('returns multiple positions when more than one matches', () => {
    const ctx = buildCtx([buildPosition(CHAIN_A), buildPosition(CHAIN_A)])
    const { result } = renderHook(() => useCollateralStatus(usdcOnChainA), {
      wrapper: withCtx(ctx),
    })
    expect(result.current.positions).toHaveLength(2)
  })

  it('passes asset matching against chain B when the asset map covers B', () => {
    const ctx = buildCtx([buildPosition(CHAIN_B)])
    const { result } = renderHook(() => useCollateralStatus(usdcOnChainB), {
      wrapper: withCtx(ctx),
    })
    expect(result.current.isPledged).toBe(true)
  })
})
