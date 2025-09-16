import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { getRandomAddress } from '@/test/utils.js'
import type { LendProvider } from '@/types/lend.js'

import { VerbsLendNamespace } from './VerbsLendNamespace.js'

describe('VerbsLendNamespace', () => {
  let mockProvider: LendProvider

  beforeEach(() => {
    mockProvider = createMockLendProvider()
  })

  it('should create an instance with a lend provider', () => {
    const namespace = new VerbsLendNamespace(mockProvider)

    expect(namespace).toBeInstanceOf(VerbsLendNamespace)
  })

  it('should delegate getMarkets to provider', async () => {
    const namespace = new VerbsLendNamespace(mockProvider)
    const mockMarkets = [
      {
        chainId: 130,
        address: getRandomAddress(),
        name: 'Test Vault',
        asset: getRandomAddress(),
        totalAssets: BigInt('1000000'),
        totalShares: BigInt('1000000'),
        apy: 0.05,
        apyBreakdown: {
          nativeApy: 0.04,
          totalRewardsApr: 0.01,
          performanceFee: 0.0,
          netApy: 0.05,
        },
        owner: getRandomAddress(),
        curator: getRandomAddress(),
        fee: 0.1,
        lastUpdate: Date.now(),
      },
    ]

    vi.mocked(mockProvider.getMarkets).mockResolvedValue(mockMarkets)

    const result = await namespace.getMarkets()

    expect(mockProvider.getMarkets).toHaveBeenCalled()
    expect(result).toBe(mockMarkets)
  })

  it('should delegate getMarket to provider', async () => {
    const namespace = new VerbsLendNamespace(mockProvider)
    const marketId = getRandomAddress()
    const chainId = 130 as const
    const mockMarket = {
      chainId: 130,
      address: marketId,
      name: 'Test Market',
      asset: getRandomAddress(),
      totalAssets: BigInt('1000000'),
      totalShares: BigInt('1000000'),
      apy: 0.05,
      apyBreakdown: {
        nativeApy: 0.04,
        totalRewardsApr: 0.01,
        performanceFee: 0.0,
        netApy: 0.05,
      },
      owner: getRandomAddress(),
      curator: getRandomAddress(),
      fee: 0.1,
      lastUpdate: Date.now(),
    }

    vi.mocked(mockProvider.getMarket).mockResolvedValue(mockMarket)

    const result = await namespace.getMarket({ address: marketId, chainId })

    expect(mockProvider.getMarket).toHaveBeenCalledWith({
      address: marketId,
      chainId,
    })
    expect(result).toBe(mockMarket)
  })

  it('should delegate getMarketBalance to provider', async () => {
    const namespace = new VerbsLendNamespace(mockProvider)
    const marketAddress = getRandomAddress()
    const walletAddress = getRandomAddress()
    const mockBalance = {
      balance: BigInt('500000'),
      balanceFormatted: '500.000',
      shares: BigInt('500000'),
      sharesFormatted: '0.5',
      chainId: 130,
    }

    vi.mocked(mockProvider.getMarketBalance).mockResolvedValue(mockBalance)

    const result = await namespace.getMarketBalance(
      marketAddress,
      walletAddress,
    )

    expect(mockProvider.getMarketBalance).toHaveBeenCalledWith(
      marketAddress,
      walletAddress,
    )
    expect(result).toBe(mockBalance)
  })

  it('should delegate supportedNetworkIds to provider', () => {
    const namespace = new VerbsLendNamespace(mockProvider)
    const mockNetworkIds = [130, 8453]

    vi.mocked(mockProvider.supportedNetworkIds).mockReturnValue(mockNetworkIds)

    const result = namespace.supportedNetworkIds()

    expect(mockProvider.supportedNetworkIds).toHaveBeenCalled()
    expect(result).toBe(mockNetworkIds)
  })

  it('should provide access to the underlying provider', () => {
    const namespace = new VerbsLendNamespace(mockProvider)

    expect(namespace['provider']).toBe(mockProvider)
  })
})
