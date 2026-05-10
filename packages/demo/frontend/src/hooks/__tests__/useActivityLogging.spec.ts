import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { ActivityLogProvider } from '@/providers/ActivityLogProvider'
import { useActivityLog } from '@/hooks/useActivityLog'
import { useLendProvider, type EarnOperations } from '../useLendProvider'
import type {
  LendMarket,
  LendMarketPosition,
  SupportedChainId,
  Asset,
} from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import type { TokenBalance } from '@eth-optimism/actions-sdk/react'

// Test data
const CHAIN_ID = 84532 as SupportedChainId
const MARKET_ADDRESS_1 = '0x1111111111111111111111111111111111111111' as Address
const MARKET_ADDRESS_2 = '0x2222222222222222222222222222222222222222' as Address
const ASSET_ADDRESS = '0x3333333333333333333333333333333333333333' as Address

const mockAsset: Asset = {
  address: { [CHAIN_ID]: ASSET_ADDRESS },
  metadata: { decimals: 6, name: 'USD Coin', symbol: 'USDC' },
  type: 'erc20',
}

const mockMarkets: LendMarket[] = [
  {
    marketId: { address: MARKET_ADDRESS_1, chainId: CHAIN_ID },
    name: 'Morpho USDC',
    asset: mockAsset,
    supply: { totalAssets: 1000000n, totalShares: 1000000n },
    apy: { total: 0.05, native: 0.03, totalRewards: 0.02 },
    metadata: {
      owner: '0x0000000000000000000000000000000000000000' as Address,
      curator: '0x0000000000000000000000000000000000000000' as Address,
      fee: 0,
      lastUpdate: 0,
    },
  },
  {
    marketId: { address: MARKET_ADDRESS_2, chainId: CHAIN_ID },
    name: 'Aave USDC',
    asset: mockAsset,
    supply: { totalAssets: 2000000n, totalShares: 2000000n },
    apy: { total: 0.04, native: 0.04, totalRewards: 0 },
    metadata: {
      owner: '0x0000000000000000000000000000000000000000' as Address,
      curator: '0x0000000000000000000000000000000000000000' as Address,
      fee: 0,
      lastUpdate: 0,
    },
  },
]

const mockPosition: LendMarketPosition = {
  balance: 0n,
  balanceFormatted: '0',
  shares: 0n,
  sharesFormatted: '0',
  marketId: { address: MARKET_ADDRESS_1, chainId: CHAIN_ID },
}

const mockTokenBalances: TokenBalance[] = [
  {
    asset: mockAsset,
    totalBalance: 100,
    totalBalanceRaw: 100000000n,
    chains: {
      [CHAIN_ID]: {
        balance: 100,
        balanceRaw: 100000000n,
      },
    },
  },
]

function createMockOperations(): EarnOperations {
  return {
    getTokenBalances: vi.fn().mockResolvedValue(mockTokenBalances),
    getMarkets: vi.fn().mockResolvedValue(mockMarkets),
    getPosition: vi.fn().mockResolvedValue(mockPosition),
    mintAsset: vi.fn().mockResolvedValue({}),
    openPosition: vi.fn().mockResolvedValue({
      transactionHash: '0xabc',
      status: 'success',
    }),
    closePosition: vi.fn().mockResolvedValue({
      transactionHash: '0xdef',
      status: 'success',
    }),
    executeSwap: vi.fn().mockResolvedValue({}),
  }
}

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })

  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ActivityLogProvider, null, children),
    )
  }

  return { Wrapper, queryClient }
}

// Helper hook that returns both lend provider state and activity log
function useLendProviderWithLog(params: {
  operations: EarnOperations
  ready: boolean
}) {
  const lendProvider = useLendProvider(params)
  const activityLog = useActivityLog()
  return { ...lendProvider, activities: activityLog.activities }
}

describe('Activity Logging', () => {
  let operations: EarnOperations

  beforeEach(() => {
    operations = createMockOperations()
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('page load logs exactly 1 getMarket, 1 getBalance, 1 getPosition', async () => {
    const { Wrapper } = createTestWrapper()

    const { result } = renderHook(
      () => useLendProviderWithLog({ operations, ready: true }),
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      expect(result.current.selectedMarket).not.toBeNull()
    })

    // Wait for all queries to settle
    await waitFor(() => {
      expect(result.current.isLoadingBalance).toBe(false)
    })

    const activities = result.current.activities
    const getMarketLogs = activities.filter((a) => a.action === 'getMarket')
    const getBalanceLogs = activities.filter((a) => a.action === 'getBalance')
    const getPositionLogs = activities.filter((a) => a.action === 'getPosition')

    expect(getMarketLogs).toHaveLength(1)
    expect(getBalanceLogs).toHaveLength(1)
    expect(getPositionLogs).toHaveLength(1)

    // All should be confirmed
    expect(getMarketLogs[0].status).toBe('confirmed')
    expect(getBalanceLogs[0].status).toBe('confirmed')
    expect(getPositionLogs[0].status).toBe('confirmed')
  })

  it('market switch produces no new log entries', async () => {
    const { Wrapper } = createTestWrapper()

    const { result } = renderHook(
      () => useLendProviderWithLog({ operations, ready: true }),
      { wrapper: Wrapper },
    )

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.selectedMarket).not.toBeNull()
    })
    await waitFor(() => {
      expect(result.current.isLoadingBalance).toBe(false)
    })

    const initialCount = result.current.activities.length

    // Switch to a different market
    act(() => {
      const otherMarket = result.current.markets.find(
        (m) =>
          m.marketId.address !==
          result.current.selectedMarket?.marketId.address,
      )
      if (otherMarket) {
        result.current.handleMarketSelect(otherMarket)
      }
    })

    // Wait for any potential refetches to settle
    await waitFor(() => {
      expect(result.current.isLoadingBalance).toBe(false)
    })

    // No new log entries should have been added
    expect(result.current.activities.length).toBe(initialCount)
  })

  it('open position logs exactly 1 deposit, 1 getBalance, 1 getPosition', async () => {
    const { Wrapper } = createTestWrapper()

    // Return updated balance after mutation to trigger shouldLogFetch
    const updatedBalances: TokenBalance[] = [
      {
        asset: mockAsset,
        totalBalance: 90,
        totalBalanceRaw: 90000000n,
        chains: {
          [CHAIN_ID]: {
            balance: 90,
            balanceRaw: 90000000n,
          },
        },
      },
    ]
    const updatedPosition: LendMarketPosition = {
      ...mockPosition,
      balance: 10000000n,
      balanceFormatted: '10',
    }

    let callCount = 0
    vi.mocked(operations.getTokenBalances).mockImplementation(async () => {
      callCount++
      return callCount <= 1 ? mockTokenBalances : updatedBalances
    })

    let positionCallCount = 0
    vi.mocked(operations.getPosition).mockImplementation(async () => {
      positionCallCount++
      // First N calls are for initial batch fetch (one per market)
      // After that, return updated position for post-mutation refetch
      return positionCallCount <= mockMarkets.length
        ? mockPosition
        : updatedPosition
    })

    const { result } = renderHook(
      () => useLendProviderWithLog({ operations, ready: true }),
      { wrapper: Wrapper },
    )

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.selectedMarket).not.toBeNull()
    })
    await waitFor(() => {
      expect(result.current.isLoadingBalance).toBe(false)
    })

    const initialCount = result.current.activities.length

    // Open a position
    await act(async () => {
      try {
        await result.current.handleTransaction('lend', 10)
      } catch {
        // May throw if blockExplorer utils fail on mock data
      }
    })

    // Wait for post-mutation refetches to settle
    await waitFor(
      () => {
        expect(result.current.isLoadingBalance).toBe(false)
      },
      { timeout: 3000 },
    )

    const newActivities = result.current.activities.slice(
      0,
      result.current.activities.length - initialCount,
    )

    const depositLogs = newActivities.filter((a) => a.action === 'deposit')
    const getBalanceLogs = newActivities.filter(
      (a) => a.action === 'getBalance',
    )
    const getPositionLogs = newActivities.filter(
      (a) => a.action === 'getPosition',
    )

    expect(depositLogs).toHaveLength(1)
    expect(getBalanceLogs).toHaveLength(1)
    expect(getPositionLogs).toHaveLength(1)
  })
})
