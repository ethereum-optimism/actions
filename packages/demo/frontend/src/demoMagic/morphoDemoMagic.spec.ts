import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MarketInfo } from '@/components/earn/MarketSelector'
import type { MarketPosition } from '@/types/market'
import {
  buildBorrowMarketPosition,
  usdcAsset,
} from '@/test-utils/borrowFixtures'
import { buildEffectiveLendPositions } from '@/utils/effectiveLendPositions'
import { useReconcileMorphoCollateral } from './morphoDemoMagic'

vi.mock('@/constants/markets', () => ({
  morphoBorrowMarketForVault: () => ({
    kind: 'morpho-blue',
    marketId: '0xborrow',
    chainId: 84532,
  }),
}))

const lentPosition = {
  provider: 'morpho',
  depositedSharesRaw: 100n,
  directDepositedAmount: '70',
  pledgedCollateralAmount: null,
  asset: usdcAsset,
  marketId: { address: '0xvault', chainId: 84532 },
} as unknown as MarketPosition

describe('useReconcileMorphoCollateral', () => {
  it('optimistically moves direct shares to pledged in one update before pledging', () => {
    const setMarketPositions = vi.fn()
    const handleTransaction = vi.fn().mockResolvedValue({})

    renderHook(() =>
      useReconcileMorphoCollateral(
        [lentPosition],
        handleTransaction,
        setMarketPositions,
      ),
    )

    expect(setMarketPositions).toHaveBeenCalledTimes(1)
    const updater = setMarketPositions.mock.calls[0][0] as (
      prev: MarketPosition[],
    ) => MarketPosition[]
    const [updated] = updater([lentPosition])
    expect(updated.directDepositedAmount).toBe('0')
    expect(updated.depositedSharesRaw).toBeNull()
    expect(updated.pledgedCollateralAmount).toBe('70')

    expect(handleTransaction).toHaveBeenCalledWith(
      'depositCollateral',
      expect.objectContaining({ amount: { max: true } }),
    )
  })

  it('keeps the lend balance stable when the pledge lands (no $140 double-count)', () => {
    const lendMarket = {
      name: 'Gauntlet USDC',
      logo: 'm.svg',
      networkName: 'Base Sepolia',
      networkLogo: 'b.svg',
      asset: usdcAsset,
      assetLogo: 'u.svg',
      apy: 0.04,
      isLoadingApy: false,
      marketId: { address: '0xvault', chainId: 84532 },
      provider: 'morpho',
    } as MarketInfo
    const pledged70 = buildBorrowMarketPosition({
      marketId: { kind: 'morpho-blue', marketId: '0xborrow', chainId: 84532 },
      collateralAsset: usdcAsset,
      collateralAmountFormatted: '70',
      borrowAmountFormatted: '10',
      borrowAmount: 10n,
    })

    // Baseline double-count.
    expect(
      buildEffectiveLendPositions([lendMarket], [lentPosition], [pledged70])[0]
        .depositedAmount,
    ).toBe('140.00')

    let positions: MarketPosition[] = [lentPosition]
    const setMarketPositions = vi.fn(
      (u: (p: MarketPosition[]) => MarketPosition[]) => {
        positions = u(positions)
      },
    )
    const handleTransaction = vi.fn().mockResolvedValue({})
    renderHook(() =>
      useReconcileMorphoCollateral(
        positions,
        handleTransaction,
        setMarketPositions,
      ),
    )

    expect(
      buildEffectiveLendPositions([lendMarket], positions, [pledged70])[0]
        .depositedAmount,
    ).toBe('70.00')
  })

  it('does not reconcile a position with no vault shares', () => {
    const setMarketPositions = vi.fn()
    const handleTransaction = vi.fn().mockResolvedValue({})
    renderHook(() =>
      useReconcileMorphoCollateral(
        [{ ...lentPosition, depositedSharesRaw: 0n }],
        handleTransaction,
        setMarketPositions,
      ),
    )
    expect(handleTransaction).not.toHaveBeenCalled()
    expect(setMarketPositions).not.toHaveBeenCalled()
  })
})
