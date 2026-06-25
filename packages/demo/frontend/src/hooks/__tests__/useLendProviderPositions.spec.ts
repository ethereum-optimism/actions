import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { ActivityLogProvider } from '@/providers/ActivityLogProvider'
import { useLendProvider, type EarnOperations } from '../useLendProvider'
import type {
  LendMarket,
  LendMarketPosition,
  SupportedChainId,
  Asset,
} from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import type { TokenBalance } from '@eth-optimism/actions-sdk/react'

const CHAIN_ID = 84532 as SupportedChainId
// Market addresses are stored mixed-case; positions come back lowercased to
// prove the join is case-insensitive (findPosition lowercases both sides).
const FUNDED_MARKET = '0xAbCdef0123456789abCDEF0123456789ABCDef01' as Address
const EMPTY_MARKET = '0x1111111111111111111111111111111111111111' as Address
const ASSET_ADDRESS = '0x3333333333333333333333333333333333333333' as Address

const asset: Asset = {
  address: { [CHAIN_ID]: ASSET_ADDRESS },
  metadata: { decimals: 6, name: 'USD Coin', symbol: 'USDC' },
  type: 'erc20',
}

function market(address: Address, name: string): LendMarket {
  return {
    marketId: { address, chainId: CHAIN_ID },
    name,
    asset,
    supply: { totalAssets: 1000000n, totalShares: 1000000n },
    apy: { total: 0.05, native: 0.03, totalRewards: 0.02 },
    metadata: {
      owner: '0x0000000000000000000000000000000000000000' as Address,
      curator: '0x0000000000000000000000000000000000000000' as Address,
      fee: 0,
      lastUpdate: 0,
    },
  }
}

function position(address: Address, balance: bigint): LendMarketPosition {
  return {
    balance,
    balanceFormatted: balance.toString(),
    shares: balance,
    sharesFormatted: balance.toString(),
    marketId: { address, chainId: CHAIN_ID },
  }
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ActivityLogProvider, null, children),
    )
  }
  return Wrapper
}

function createOperations(positions: LendMarketPosition[]): EarnOperations {
  return {
    getTokenBalances: vi.fn().mockResolvedValue([] as TokenBalance[]),
    getMarkets: vi
      .fn()
      .mockResolvedValue([
        market(FUNDED_MARKET, 'Morpho'),
        market(EMPTY_MARKET, 'Aave'),
      ]),
    // getPosition (single-market, used by the selected-market sync effect)
    // must agree with getPositions, or the sync effect would drop the funded
    // market. Resolve from the same positions array by marketId.
    getPosition: vi.fn().mockImplementation(async (marketId) => {
      const match = positions.find(
        (p) =>
          p.marketId.address.toLowerCase() === marketId.address.toLowerCase(),
      )
      return match ?? position(marketId.address, 0n)
    }),
    getPositions: vi.fn().mockResolvedValue(positions),
    mintAsset: vi.fn().mockResolvedValue({}),
    openPosition: vi.fn().mockResolvedValue({}),
    closePosition: vi.fn().mockResolvedValue({}),
    executeSwap: vi.fn().mockResolvedValue({}),
  }
}

describe('useLendProvider getPositions join', () => {
  it('keeps only funded markets and matches addresses case-insensitively', async () => {
    // FUNDED_MARKET position returned lowercased + non-zero; EMPTY_MARKET zero.
    const operations = createOperations([
      position(FUNDED_MARKET.toLowerCase() as Address, 10_000_000n),
      position(EMPTY_MARKET, 0n),
    ])

    const { result } = renderHook(
      () => useLendProvider({ operations, ready: true }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.selectedMarket).not.toBeNull()
    })
    await waitFor(() => {
      expect(operations.getPositions).toHaveBeenCalled()
    })

    // Only the funded market survives, joined despite the case mismatch.
    await waitFor(() => {
      expect(result.current.marketPositions).toHaveLength(1)
    })
    const funded = result.current.marketPositions[0]
    expect(funded.marketName).toBe('Morpho')
    expect(funded.marketId.address).toBe(FUNDED_MARKET)
    expect(funded.depositedAmount).toBe('10000000')
    expect(funded.depositedSharesRaw).toBe(10_000_000n)
  })

  it('returns no positions when every market is zero-balance', async () => {
    const operations = createOperations([
      position(FUNDED_MARKET, 0n),
      position(EMPTY_MARKET, 0n),
    ])

    const { result } = renderHook(
      () => useLendProvider({ operations, ready: true }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(operations.getPositions).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(result.current.selectedMarket).not.toBeNull()
    })
    expect(result.current.marketPositions).toHaveLength(0)
  })
})
