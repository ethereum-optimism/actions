import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Asset, BorrowMarket } from '@eth-optimism/actions-sdk'

import type { MarketPosition } from '@/types/market'
import { useBorrowTransaction } from '../useBorrowTransaction'

vi.mock('@/hooks/useActivityLogger', () => ({
  useActivityLogger: () => ({
    logActivity: () => ({ confirm: vi.fn(), error: vi.fn() }),
  }),
}))

const market = {
  marketId: {
    kind: 'morpho-blue',
    marketId: '0x' + 'a'.repeat(64),
    chainId: 84532,
  },
  borrowAsset: { metadata: { symbol: 'OP_DEMO', decimals: 18 } },
} as unknown as BorrowMarket

const asset = { metadata: { symbol: 'OP_DEMO', decimals: 18 } } as Asset

function lendPosition(shares: bigint): MarketPosition {
  return {
    depositedSharesRaw: shares,
    directDepositedSharesRaw: shares,
  } as unknown as MarketPosition
}

async function runBorrow(currentCollUsd: number, shares: bigint) {
  const handleTransaction = vi
    .fn()
    .mockResolvedValue({ marketId: market.marketId })
  const { result } = renderHook(() => useBorrowTransaction())
  await act(async () => {
    await result.current.runTransaction({
      mode: 'borrow',
      activeMarket: market,
      activeAsset: asset,
      amountNum: 1,
      selectedLendPosition: lendPosition(shares),
      currentCollUsd,
      handleTransaction,
      onReviewClose: vi.fn(),
      onSuccess: vi.fn(),
    })
  })
  return handleTransaction
}

describe('useBorrowTransaction borrow collateral', () => {
  it('does not pledge collateral on a top-up borrow (existing collateral)', async () => {
    const handleTransaction = await runBorrow(50, 100n)
    expect(handleTransaction).toHaveBeenCalledTimes(1)
    const [action, params] = handleTransaction.mock.calls[0]
    expect(action).toBe('open')
    expect(params).not.toHaveProperty('collateralAmount')
  })

  it('pledges the lend position as collateral on a fresh open', async () => {
    const handleTransaction = await runBorrow(0, 100n)
    const [, params] = handleTransaction.mock.calls[0]
    expect(params.collateralAmount).toEqual({ amountRaw: 100n })
  })
})
