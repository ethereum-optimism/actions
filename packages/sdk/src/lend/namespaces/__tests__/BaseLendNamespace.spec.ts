import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BaseLendNamespace } from '@/lend/namespaces/BaseLendNamespace.js'
import type { MockLendProvider } from '@/test/MockLendProvider.js'
import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { getRandomAddress } from '@/test/utils.js'

// Concrete implementation for testing
class TestLendNamespace extends BaseLendNamespace {}

describe('BaseLendNamespace', () => {
  let mockMorphoProvider: MockLendProvider
  let mockAaveProvider: MockLendProvider
  let mockMarketId: { address: Address; chainId: 130 }
  let aaveMarketId: { address: Address; chainId: 130 }

  beforeEach(() => {
    mockMarketId = { address: getRandomAddress(), chainId: 130 as const }
    aaveMarketId = { address: getRandomAddress(), chainId: 130 as const }

    mockMorphoProvider = createMockLendProvider({
      marketAllowlist: [
        {
          address: mockMarketId.address,
          chainId: mockMarketId.chainId,
          name: 'Morpho Market',
          asset: {
            address: { 130: getRandomAddress() },
            metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
            type: 'erc20' as const,
          },
          lendProvider: 'morpho',
        },
      ],
    })

    mockAaveProvider = createMockLendProvider({
      marketAllowlist: [
        {
          address: aaveMarketId.address,
          chainId: aaveMarketId.chainId,
          name: 'Aave Market',
          asset: {
            address: { 130: getRandomAddress() },
            metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
            type: 'erc20' as const,
          },
          lendProvider: 'aave',
        },
      ],
    })
  })

  describe('getMarkets', () => {
    it('should aggregate markets from all providers', async () => {
      const namespace = new TestLendNamespace({
        morpho: mockMorphoProvider,
        aave: mockAaveProvider,
      })

      const markets = await namespace.getMarkets()

      expect(markets).toHaveLength(2)
    })

    it('should work with single provider', async () => {
      const namespace = new TestLendNamespace({
        morpho: mockMorphoProvider,
      })

      const markets = await namespace.getMarkets()

      expect(markets).toHaveLength(1)
    })
  })

  describe('getMarket', () => {
    it('should route to correct provider based on market', async () => {
      const namespace = new TestLendNamespace({
        morpho: mockMorphoProvider,
        aave: mockAaveProvider,
      })

      const morphoSpy = vi.spyOn(mockMorphoProvider, 'getMarket')
      const aaveSpy = vi.spyOn(mockAaveProvider, 'getMarket')

      await namespace.getMarket(mockMarketId)

      expect(morphoSpy).toHaveBeenCalledWith(mockMarketId)
      expect(aaveSpy).not.toHaveBeenCalled()
    })

    it('should throw if no provider found for market', async () => {
      const namespace = new TestLendNamespace({
        morpho: mockMorphoProvider,
      })

      const unknownMarket = {
        address: getRandomAddress(),
        chainId: 130 as const,
      }

      await expect(namespace.getMarket(unknownMarket)).rejects.toThrow(
        'No provider configured for market',
      )
    })
  })

  describe('supportedChainIds', () => {
    it('should return unique chain IDs from all providers', () => {
      const namespace = new TestLendNamespace({
        morpho: mockMorphoProvider,
        aave: mockAaveProvider,
      })

      const chainIds = namespace.supportedChainIds()

      expect(Array.isArray(chainIds)).toBe(true)
      expect(chainIds.length).toBeGreaterThan(0)
    })

    it('should deduplicate chain IDs', () => {
      const namespace = new TestLendNamespace({
        morpho: mockMorphoProvider,
        aave: mockAaveProvider,
      })

      const chainIds = namespace.supportedChainIds()
      const uniqueChainIds = [...new Set(chainIds)]

      expect(chainIds).toEqual(uniqueChainIds)
    })
  })
})
