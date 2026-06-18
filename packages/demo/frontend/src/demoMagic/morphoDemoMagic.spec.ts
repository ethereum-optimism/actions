import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MarketPosition } from '@/types/market'
import { useReconcileMorphoCollateral } from './morphoDemoMagic'

// The vault has a configured borrow market so the reconcile proceeds.
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

    // Optimistic update runs synchronously when the reconcile fires.
    expect(setMarketPositions).toHaveBeenCalledTimes(1)
    const updater = setMarketPositions.mock.calls[0][0] as (
      prev: MarketPosition[],
    ) => MarketPosition[]
    const [updated] = updater([lentPosition])
    // Same shares now show as pledged, not direct — no double-count window.
    expect(updated.directDepositedAmount).toBe('0')
    expect(updated.depositedSharesRaw).toBeNull()
    expect(updated.pledgedCollateralAmount).toBe('70')

    expect(handleTransaction).toHaveBeenCalledWith(
      'depositCollateral',
      expect.objectContaining({ amount: { max: true } }),
    )
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
