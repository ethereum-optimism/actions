import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getRandomAddress } from '@/__mocks__/utils.js'
import type { MockLendProvider } from '@/actions/lend/__mocks__/MockLendProvider.js'
import { createMockLendProvider } from '@/actions/lend/__mocks__/MockLendProvider.js'
import { ActionsLendNamespace } from '@/actions/lend/namespaces/ActionsLendNamespace.js'

describe('ActionsLendNamespace', () => {
  let mockProvider: MockLendProvider
  let mockMarketId: { address: Address; chainId: 130 }

  beforeEach(() => {
    mockMarketId = { address: getRandomAddress(), chainId: 130 as const }

    mockProvider = createMockLendProvider({
      marketAllowlist: [
        {
          address: mockMarketId.address,
          chainId: mockMarketId.chainId,
          name: 'Test Market',
          asset: {
            address: { 130: getRandomAddress() },
            metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
            type: 'erc20' as const,
          },
          lendProvider: 'morpho',
        },
      ],
    })
  })

  it('should create an instance with a lend provider', () => {
    const namespace = new ActionsLendNamespace({ morpho: mockProvider })

    expect(namespace).toBeInstanceOf(ActionsLendNamespace)
  })

  it('should delegate getMarkets to provider', async () => {
    const namespace = new ActionsLendNamespace({ morpho: mockProvider })
    const spy = vi.spyOn(mockProvider, 'getMarkets')

    await namespace.getMarkets()

    expect(spy).toHaveBeenCalledOnce()
  })

  it('should delegate getMarket to provider with correct parameters', async () => {
    const namespace = new ActionsLendNamespace({ morpho: mockProvider })
    const spy = vi.spyOn(mockProvider, 'getMarket')

    await namespace.getMarket(mockMarketId)

    expect(spy).toHaveBeenCalledWith(mockMarketId)
  })

  it('should delegate supportedChainIds to provider', () => {
    const namespace = new ActionsLendNamespace({ morpho: mockProvider })
    const spy = vi.spyOn(mockProvider, 'supportedChainIds')

    namespace.supportedChainIds()

    expect(spy).toHaveBeenCalledOnce()
  })

  describe('getPositions', () => {
    const walletAddress = getRandomAddress()
    let mockAaveProvider: MockLendProvider
    let aaveMarketId: { address: Address; chainId: 130 }

    beforeEach(() => {
      aaveMarketId = { address: getRandomAddress(), chainId: 130 as const }
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

    it('aggregates positions across all configured providers', async () => {
      const namespace = new ActionsLendNamespace({
        morpho: mockProvider,
        aave: mockAaveProvider,
      })

      const positions = await namespace.getPositions(walletAddress)

      expect(positions).toHaveLength(2)
      expect(positions.map((p) => p.marketId.address)).toEqual(
        expect.arrayContaining([mockMarketId.address, aaveMarketId.address]),
      )
    })

    it('restricts to a single provider when provider filter is set', async () => {
      const namespace = new ActionsLendNamespace({
        morpho: mockProvider,
        aave: mockAaveProvider,
      })
      const aaveSpy = vi.spyOn(mockAaveProvider, 'getPositions')

      const positions = await namespace.getPositions(walletAddress, {
        provider: 'morpho',
      })

      expect(positions).toHaveLength(1)
      expect(positions[0].marketId.address).toBe(mockMarketId.address)
      expect(aaveSpy).not.toHaveBeenCalled()
    })

    it('drops zero-balance positions when nonZeroOnly is set', async () => {
      mockAaveProvider.getPosition.mockResolvedValue({
        balance: 0n,
        balanceFormatted: '0',
        shares: 0n,
        sharesFormatted: '0',
        marketId: aaveMarketId,
      })
      const namespace = new ActionsLendNamespace({
        morpho: mockProvider,
        aave: mockAaveProvider,
      })

      const all = await namespace.getPositions(walletAddress)
      const nonZero = await namespace.getPositions(walletAddress, {
        options: { nonZeroOnly: true },
      })

      expect(all).toHaveLength(2)
      expect(nonZero).toHaveLength(1)
      expect(nonZero[0].marketId.address).toBe(mockMarketId.address)
    })
  })
})
