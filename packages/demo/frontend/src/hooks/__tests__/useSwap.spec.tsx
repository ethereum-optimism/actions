import { createElement, type ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { TokenBalance } from '@eth-optimism/actions-sdk/react'
import { describe, expect, it, vi } from 'vitest'

import { OP_DEMO, USDC_DEMO } from '@/constants/markets'
import { useSwap } from '@/hooks/useSwap'
import { useTokenBalances } from '@/queries/useTokenBalances'
import { ActivityLogProvider } from '@/providers/ActivityLogProvider'
import type { EarnOperations } from '@/hooks/useLendProvider'

const CHAIN_ID = 84532
const tokenBalances: TokenBalance[] = [
  {
    asset: USDC_DEMO,
    totalBalance: 10,
    totalBalanceRaw: 10_000_000n,
    chains: {
      [CHAIN_ID]: { balance: 10, balanceRaw: 10_000_000n },
    },
  },
  {
    asset: OP_DEMO,
    totalBalance: 20,
    totalBalanceRaw: 20_000_000_000_000_000_000n,
    chains: {
      [CHAIN_ID]: {
        balance: 20,
        balanceRaw: 20_000_000_000_000_000_000n,
      },
    },
  },
]

function createOperations(
  getTokenBalances: EarnOperations['getTokenBalances'],
): EarnOperations {
  return {
    getTokenBalances,
    getMarkets: async () => [],
    getPosition: async () => {
      throw new Error('Not used by this test')
    },
    getPositions: async () => [],
    mintAsset: async () => undefined,
    openPosition: async () => {
      throw new Error('Not used by this test')
    },
    closePosition: async () => {
      throw new Error('Not used by this test')
    },
    executeSwap: async () => ({}),
    getConfiguredAssets: async () => [USDC_DEMO, OP_DEMO],
    getSwapMarkets: async () => [],
    getSwapQuote: async () => null,
  }
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ActivityLogProvider, null, children),
    )
  }
}

describe('useSwap', () => {
  it('preserves shared balances when they are invalidated', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const getTokenBalances = vi.fn(async () => tokenBalances)
    const operations = createOperations(getTokenBalances)

    const { result } = renderHook(
      () => {
        const balanceQuery = useTokenBalances({
          getTokenBalances,
          isReady: () => true,
        })
        const swap = useSwap({ operations, activeTab: 'swap' })
        return { balanceQuery, swap }
      },
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => expect(result.current.swap.swapAssets).toHaveLength(2))
    getTokenBalances.mockClear()

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
    })

    expect(getTokenBalances).toHaveBeenCalledOnce()
    expect(queryClient.getQueryData(['tokenBalances'])).toEqual(tokenBalances)
    expect(result.current.swap.swapAssets).toHaveLength(2)
  })
})
