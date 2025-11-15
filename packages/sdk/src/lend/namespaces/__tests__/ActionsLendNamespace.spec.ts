import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ActionsLendNamespace } from '@/lend/namespaces/ActionsLendNamespace.js'
import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { getRandomAddress } from '@/test/utils.js'
import type { LendProvider } from '@/types/lend/index.js'

describe('ActionsLendNamespace', () => {
  let mockProvider: LendProvider
  let mockMarketId: { address: any; chainId: 130 }

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
    const namespace = new ActionsLendNamespace({ morpho: mockProvider as any })

    expect(namespace).toBeInstanceOf(ActionsLendNamespace)
  })

  it('should delegate getMarkets to provider', async () => {
    const namespace = new ActionsLendNamespace({ morpho: mockProvider as any })
    const spy = vi.spyOn(mockProvider, 'getMarkets')

    await namespace.getMarkets()

    expect(spy).toHaveBeenCalledOnce()
  })

  it('should delegate getMarket to provider with correct parameters', async () => {
    const namespace = new ActionsLendNamespace({ morpho: mockProvider as any })
    const spy = vi.spyOn(mockProvider, 'getMarket')

    await namespace.getMarket(mockMarketId)

    expect(spy).toHaveBeenCalledWith(mockMarketId)
  })

  it('should delegate supportedChainIds to provider', () => {
    const namespace = new ActionsLendNamespace({ morpho: mockProvider as any })
    const spy = vi.spyOn(mockProvider, 'supportedChainIds')

    namespace.supportedChainIds()

    expect(spy).toHaveBeenCalledOnce()
  })
})
