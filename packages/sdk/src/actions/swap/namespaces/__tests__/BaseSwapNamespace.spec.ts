import { describe, expect, it } from 'vitest'

import {
  createMockSwapProvider,
  MockSwapProvider,
} from '@/actions/swap/__mocks__/MockSwapProvider.js'
import { ActionsSwapNamespace } from '@/actions/swap/namespaces/ActionsSwapNamespace.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'

describe('BaseSwapNamespace', () => {
  const USDC = {
    type: 'erc20' as const,
    address: { 84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const },
    metadata: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
  }
  const ETH = {
    type: 'native' as const,
    address: { 84532: '0x0000000000000000000000000000000000000000' as const },
    metadata: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  }

  describe('getQuote', () => {
    it('delegates to provider getQuote', async () => {
      const provider = createMockSwapProvider()
      const namespace = new ActionsSwapNamespace({ uniswap: provider })

      const result = await namespace.getQuote({
        assetIn: USDC,
        assetOut: ETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
      })

      expect(provider.mockGetQuote).toHaveBeenCalledTimes(1)
      expect(result.price).toBe(1.5)
      expect(result.execution).toBeDefined()
      expect(result.execution.swapCalldata).toMatch(/^0x/)
      expect(result.provider).toBe('uniswap')
    })

    it('throws if no provider configured', async () => {
      const namespace = new ActionsSwapNamespace({})

      await expect(
        namespace.getQuote({
          assetIn: USDC,
          assetOut: ETH,
          amountIn: 100,
          chainId: 84532 as SupportedChainId,
        }),
      ).rejects.toThrow('No swap provider configured')
    })
  })

  describe('getQuote with price routing', () => {
    it('returns the best price across providers when routing is price', async () => {
      const cheapProvider = new MockSwapProvider(
        { marketAllowlist: [{ assets: [USDC, ETH] }] },
        { defaultPrice: 1.2, provider: 'uniswap' },
      )
      const expensiveProvider = new MockSwapProvider(
        { marketAllowlist: [{ assets: [USDC, ETH] }] },
        { defaultPrice: 1.8, provider: 'velodrome' },
      )

      const namespace = new ActionsSwapNamespace(
        { uniswap: cheapProvider, velodrome: expensiveProvider },
        undefined,
        { routing: 'price' },
      )

      const result = await namespace.getQuote({
        assetIn: USDC,
        assetOut: ETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
      })

      // Should pick velodrome because 1.8 > 1.2 (higher amountOut)
      expect(result.provider).toBe('velodrome')
    })

    it('skips providers that fail to quote', async () => {
      const workingProvider = createMockSwapProvider(
        { marketAllowlist: [{ assets: [USDC, ETH] }] },
        { provider: 'velodrome' },
      )
      const failingProvider = createMockSwapProvider(
        { marketAllowlist: [{ assets: [USDC, ETH] }] },
        { provider: 'uniswap' },
      )
      failingProvider.mockGetQuote.mockRejectedValue(new Error('RPC failure'))

      const namespace = new ActionsSwapNamespace(
        { uniswap: failingProvider, velodrome: workingProvider },
        undefined,
        { routing: 'price' },
      )

      const result = await namespace.getQuote({
        assetIn: USDC,
        assetOut: ETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
      })

      expect(result.provider).toBe('velodrome')
    })

    it('throws when all providers fail to quote', async () => {
      const failingProvider = createMockSwapProvider({
        marketAllowlist: [{ assets: [USDC, ETH] }],
      })
      failingProvider.mockGetQuote.mockRejectedValue(new Error('fail'))

      const namespace = new ActionsSwapNamespace(
        { uniswap: failingProvider },
        undefined,
        { routing: 'price' },
      )

      await expect(
        namespace.getQuote({
          assetIn: USDC,
          assetOut: ETH,
          amountIn: 100,
          chainId: 84532 as SupportedChainId,
        }),
      ).rejects.toThrow('All providers failed')
    })

    it('uses explicit provider when specified, ignoring routing', async () => {
      const cheapProvider = new MockSwapProvider(
        { marketAllowlist: [{ assets: [USDC, ETH] }] },
        { defaultPrice: 1.2, provider: 'uniswap' },
      )
      const expensiveProvider = new MockSwapProvider(
        { marketAllowlist: [{ assets: [USDC, ETH] }] },
        { defaultPrice: 1.8, provider: 'velodrome' },
      )

      const namespace = new ActionsSwapNamespace(
        { uniswap: cheapProvider, velodrome: expensiveProvider },
        undefined,
        { routing: 'price' },
      )

      const result = await namespace.getQuote({
        assetIn: USDC,
        assetOut: ETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
        provider: 'uniswap',
      })

      // Should use uniswap despite worse price because it was explicitly requested
      expect(result.provider).toBe('uniswap')
    })
  })

  describe('getQuotes', () => {
    it('returns quotes from all eligible providers sorted by best price', async () => {
      const cheapProvider = new MockSwapProvider(
        { marketAllowlist: [{ assets: [USDC, ETH] }] },
        { defaultPrice: 1.2, provider: 'uniswap' },
      )
      const expensiveProvider = new MockSwapProvider(
        { marketAllowlist: [{ assets: [USDC, ETH] }] },
        { defaultPrice: 1.8, provider: 'velodrome' },
      )

      const namespace = new ActionsSwapNamespace({
        uniswap: cheapProvider,
        velodrome: expensiveProvider,
      })

      const quotes = await namespace.getQuotes({
        assetIn: USDC,
        assetOut: ETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
      })

      expect(quotes).toHaveLength(2)
      expect(quotes[0].provider).toBe('velodrome')
      expect(quotes[1].provider).toBe('uniswap')
    })

    it('skips failed providers and returns successful ones', async () => {
      const workingProvider = createMockSwapProvider(
        { marketAllowlist: [{ assets: [USDC, ETH] }] },
        { provider: 'velodrome' },
      )
      const failingProvider = createMockSwapProvider(
        { marketAllowlist: [{ assets: [USDC, ETH] }] },
        { provider: 'uniswap' },
      )
      failingProvider.mockGetQuote.mockRejectedValue(new Error('fail'))

      const namespace = new ActionsSwapNamespace({
        uniswap: failingProvider,
        velodrome: workingProvider,
      })

      const quotes = await namespace.getQuotes({
        assetIn: USDC,
        assetOut: ETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
      })

      expect(quotes).toHaveLength(1)
      expect(quotes[0].provider).toBe('velodrome')
    })

    it('returns single-element array when explicit provider specified', async () => {
      const provider1 = createMockSwapProvider(undefined, {
        provider: 'uniswap',
      })
      const provider2 = new MockSwapProvider(undefined, {
        supportedChains: [84532 as SupportedChainId],
        provider: 'velodrome',
      })

      const namespace = new ActionsSwapNamespace({
        uniswap: provider1,
        velodrome: provider2,
      })

      const quotes = await namespace.getQuotes({
        assetIn: USDC,
        assetOut: ETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
        provider: 'uniswap',
      })

      expect(quotes).toHaveLength(1)
      expect(quotes[0].provider).toBe('uniswap')
    })
  })

  describe('getMarket', () => {
    it('delegates to provider getMarket', async () => {
      const provider = createMockSwapProvider()
      const namespace = new ActionsSwapNamespace({ uniswap: provider })

      const result = await namespace.getMarket({
        poolId: '0xpool123',
        chainId: 84532 as SupportedChainId,
      })

      expect(provider.mockGetMarket).toHaveBeenCalledTimes(1)
      expect(result.marketId.poolId).toBe('0xpool123')
    })

    it('queries specific provider when specified', async () => {
      const provider1 = createMockSwapProvider(undefined, {
        provider: 'uniswap',
      })
      const provider2 = new MockSwapProvider(undefined, {
        supportedChains: [84532 as SupportedChainId],
        provider: 'velodrome',
      })

      const namespace = new ActionsSwapNamespace({
        uniswap: provider1,
        velodrome: provider2,
      })

      await namespace.getMarket(
        { poolId: '0xpool123', chainId: 84532 as SupportedChainId },
        'velodrome',
      )

      expect(provider2.mockGetMarket).toHaveBeenCalledTimes(1)
      expect(provider1.mockGetMarket).not.toHaveBeenCalled()
    })

    it('throws for unknown provider name', async () => {
      const namespace = new ActionsSwapNamespace({
        uniswap: createMockSwapProvider(),
      })

      await expect(
        namespace.getMarket(
          { poolId: '0x1', chainId: 84532 as SupportedChainId },
          'velodrome',
        ),
      ).rejects.toThrow('not configured')
    })
  })

  describe('getMarkets', () => {
    it('aggregates markets from all providers', async () => {
      const provider1 = createMockSwapProvider()
      const provider2 = new MockSwapProvider(undefined, {
        supportedChains: [84532 as SupportedChainId],
      })

      const namespace = new ActionsSwapNamespace({
        uniswap: provider1,
        velodrome: provider2,
      })

      const result = await namespace.getMarkets({})

      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(provider1.mockGetMarkets).toHaveBeenCalledTimes(1)
      expect(provider2.mockGetMarkets).toHaveBeenCalledTimes(1)
    })

    it('returns empty array when no providers', async () => {
      const namespace = new ActionsSwapNamespace({})

      const result = await namespace.getMarkets({})

      expect(result).toEqual([])
    })
  })

  describe('supportedChainIds', () => {
    it('returns union of chains from all providers', () => {
      const provider1 = createMockSwapProvider(undefined, {
        supportedChains: [84532 as SupportedChainId],
      })
      const provider2 = new MockSwapProvider(
        undefined,
        { supportedChains: [1 as SupportedChainId, 10 as SupportedChainId] },
        new MockChainManager({
          supportedChains: [1 as SupportedChainId, 10 as SupportedChainId],
        }) as unknown as ChainManager,
      )

      const namespace = new ActionsSwapNamespace({
        uniswap: provider1,
        velodrome: provider2,
      })

      const result = namespace.supportedChainIds()

      expect(result).toContain(84532)
      expect(result).toContain(1)
      expect(result).toContain(10)
      expect(result.length).toBe(3)
    })

    it('deduplicates chain IDs', () => {
      const provider1 = createMockSwapProvider(undefined, {
        supportedChains: [84532 as SupportedChainId, 1 as SupportedChainId],
      })
      const provider2 = new MockSwapProvider(undefined, {
        supportedChains: [1 as SupportedChainId],
      })

      const namespace = new ActionsSwapNamespace({
        uniswap: provider1,
        velodrome: provider2,
      })

      const result = namespace.supportedChainIds()

      // Should have unique values only
      expect(new Set(result).size).toBe(result.length)
    })
  })
})
