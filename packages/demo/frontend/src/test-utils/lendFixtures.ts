import type {
  Asset,
  LendMarket,
  LendMarketPosition,
  SupportedChainId,
  TokenBalance,
} from '@eth-optimism/actions-sdk/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import type { Address } from 'viem'
import { vi } from 'vitest'

import type { EarnOperations } from '@/hooks/useLendProvider'
import { ActivityLogProvider } from '@/providers/ActivityLogProvider'

export const LEND_CHAIN_ID = 84532 as SupportedChainId
export const FUNDED_LEND_MARKET =
  '0xAbCdef0123456789abCDEF0123456789ABCDef01' as Address
export const EMPTY_LEND_MARKET =
  '0x1111111111111111111111111111111111111111' as Address

const LEND_ASSET_ADDRESS =
  '0x3333333333333333333333333333333333333333' as Address
const LEND_ASSET: Asset = {
  address: { [LEND_CHAIN_ID]: LEND_ASSET_ADDRESS },
  metadata: { decimals: 6, name: 'USD Coin', symbol: 'USDC' },
  type: 'erc20',
}

/**
 * @description Builds a lend market fixture on the default test chain.
 * @param address The market contract address.
 * @param name The provider name shown by the demo.
 * @returns A lend market fixture.
 */
export function buildLendMarket(address: Address, name: string): LendMarket {
  return {
    marketId: { address, chainId: LEND_CHAIN_ID },
    name,
    asset: LEND_ASSET,
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

/**
 * @description Builds a lend position fixture on the default test chain.
 * @param address The position's market contract address.
 * @param balance The supplied asset balance in base units.
 * @returns A lend position fixture.
 */
export function buildLendPosition(
  address: Address,
  balance: bigint,
): LendMarketPosition {
  return {
    balance,
    balanceFormatted: balance.toString(),
    shares: balance,
    sharesFormatted: balance.toString(),
    marketId: { address, chainId: LEND_CHAIN_ID },
  }
}

/**
 * @description Creates the providers required to render lend hooks in tests.
 * @returns A React wrapper with isolated query and activity-log providers.
 */
export function makeLendHookWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return function LendHookWrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ActivityLogProvider, null, children),
    )
  }
}

/**
 * @description Creates lend operation mocks backed by the supplied positions.
 * @param positions The positions returned by aggregate position reads.
 * @returns Mock lend operations for frontend hook tests.
 */
export function createMockLendOperations(
  positions: readonly LendMarketPosition[],
): EarnOperations {
  return {
    getTokenBalances: vi.fn().mockResolvedValue([] as TokenBalance[]),
    getMarkets: vi
      .fn()
      .mockResolvedValue([
        buildLendMarket(FUNDED_LEND_MARKET, 'Morpho'),
        buildLendMarket(EMPTY_LEND_MARKET, 'Aave'),
      ]),
    getPosition: vi.fn().mockImplementation(async (marketId) => {
      const match = positions.find(
        (position) =>
          position.marketId.address.toLowerCase() ===
          marketId.address.toLowerCase(),
      )
      return match ?? buildLendPosition(marketId.address, 0n)
    }),
    getPositions: vi.fn().mockResolvedValue([...positions]),
    mintAsset: vi.fn().mockResolvedValue({}),
    openPosition: vi.fn().mockResolvedValue({}),
    closePosition: vi.fn().mockResolvedValue({}),
    executeSwap: vi.fn().mockResolvedValue({}),
    getConfiguredAssets: vi.fn().mockResolvedValue([LEND_ASSET]),
    getSwapMarkets: vi.fn().mockResolvedValue([]),
    getSwapQuote: vi.fn().mockResolvedValue(null),
  }
}
