import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as lendService from './lend.js'

// Mock the verbs config module
vi.mock('../config/verbs.js', () => ({
  getVerbs: vi.fn(),
}))

const mockLendProvider = {
  getMarkets: vi.fn(),
  getMarket: vi.fn(),
}

const mockVerbs = {
  lend: mockLendProvider,
}

describe('Lend Service', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { getVerbs } = await import('../config/verbs.js')
    vi.mocked(getVerbs).mockReturnValue(mockVerbs as any)
  })

  describe('getMarkets', () => {
    it('should return markets from the lend provider', async () => {
      const mockMarkets = [
        {
          address:
            '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' as `0x${string}`,
          name: 'Gauntlet USDC',
          asset: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842' as `0x${string}`,
          apy: 0.03,
          totalAssets: BigInt('1000000'),
          totalShares: BigInt('1000000'),
          owner: '0x5a4E19842e09000a582c20A4f524C26Fb48Dd4D0' as `0x${string}`,
          curator:
            '0x9E33faAE38ff641094fa68c65c2cE600b3410585' as `0x${string}`,
          fee: 0.1,
          lastUpdate: 1234567890,
        },
      ]

      mockLendProvider.getMarkets.mockResolvedValue(mockMarkets)

      const result = await lendService.getMarkets()

      expect(result).toEqual(mockMarkets)
      expect(mockLendProvider.getMarkets).toHaveBeenCalledOnce()
    })

    it('should throw error when lend provider fails', async () => {
      const error = new Error('Lend provider error')
      mockLendProvider.getMarkets.mockRejectedValue(error)

      await expect(lendService.getMarkets()).rejects.toThrow(
        'Lend provider error',
      )
    })

    it('should handle unknown errors', async () => {
      mockLendProvider.getMarkets.mockRejectedValue('Unknown error')

      await expect(lendService.getMarkets()).rejects.toThrow('Unknown error')
    })
  })

  describe('getMarket', () => {
    const marketId =
      '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' as `0x${string}`
    const chainId = 130

    it('should return market info from the lend provider', async () => {
      const mockMarketInfo = {
        address: marketId,
        name: 'Gauntlet USDC',
        asset: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842' as `0x${string}`,
        apy: 0.03,
        totalAssets: BigInt('1000000'),
        totalShares: BigInt('1000000'),
        owner: '0x5a4E19842e09000a582c20A4f524C26Fb48Dd4D0' as `0x${string}`,
        curator: '0x9E33faAE38ff641094fa68c65c2cE600b3410585' as `0x${string}`,
        fee: 0.1,
        lastUpdate: 1234567890,
      }

      mockLendProvider.getMarket.mockResolvedValue(mockMarketInfo)

      const result = await lendService.getMarket(marketId, chainId)

      expect(result).toEqual(mockMarketInfo)
      expect(mockLendProvider.getMarket).toHaveBeenCalledWith({
        address: marketId,
        chainId,
      })
    })

    it('should throw error when lend provider fails', async () => {
      const error = new Error('Market not found')
      mockLendProvider.getMarket.mockRejectedValue(error)

      await expect(lendService.getMarket(marketId, chainId)).rejects.toThrow(
        'Market not found',
      )
    })

    it('should handle unknown errors', async () => {
      mockLendProvider.getMarket.mockRejectedValue('Unknown error')

      await expect(lendService.getMarket(marketId, chainId)).rejects.toThrow(
        'Unknown error',
      )
    })
  })
})
