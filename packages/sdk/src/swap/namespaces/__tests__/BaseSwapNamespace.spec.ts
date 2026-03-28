import { describe, expect, it } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  createMockSwapProvider,
  MockSwapProvider,
} from '@/swap/__mocks__/MockSwapProvider.js'
import { ActionsSwapNamespace } from '@/swap/namespaces/ActionsSwapNamespace.js'

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

  describe('price', () => {
    it('delegates to provider getPrice', async () => {
      const provider = createMockSwapProvider()
      const namespace = new ActionsSwapNamespace({ uniswap: provider })

      const result = await namespace.price({
        assetIn: USDC,
        assetOut: ETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
      })

      expect(provider.mockGetPrice).toHaveBeenCalledTimes(1)
      expect(result.price).toBe('1.5')
    })

    it('throws if no provider configured', async () => {
      const namespace = new ActionsSwapNamespace({})

      await expect(
        namespace.price({
          assetIn: USDC,
          assetOut: ETH,
          amountIn: 100,
          chainId: 84532 as SupportedChainId,
        }),
      ).rejects.toThrow('No swap provider configured')
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
  })

  describe('getMarkets', () => {
    it('aggregates markets from all providers', async () => {
      const provider1 = createMockSwapProvider()
      const provider2 = new MockSwapProvider(undefined, {
        supportedChains: [84532 as SupportedChainId],
      })

      const namespace = new ActionsSwapNamespace({
        uniswap: provider1,
      })

      // Add second provider manually for testing aggregation
      ;(namespace as unknown as { providers: Record<string, unknown> }).providers.oneInch = provider2

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
      const provider2 = new MockSwapProvider(undefined, {
        supportedChains: [1 as SupportedChainId, 10 as SupportedChainId],
      })

      const namespace = new ActionsSwapNamespace({
        uniswap: provider1,
      })
      ;(namespace as unknown as { providers: Record<string, unknown> }).providers.oneInch = provider2

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
      })
      ;(namespace as unknown as { providers: Record<string, unknown> }).providers.oneInch = provider2

      const result = namespace.supportedChainIds()

      // Should have unique values only
      expect(new Set(result).size).toBe(result.length)
    })
  })
})
