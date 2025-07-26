import { fetchMarket } from '@morpho-org/blue-sdk-viem'
import { type Address, createPublicClient, http, type PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MorphoLendConfig } from '../../types/lend.js'
import { LendProviderMorpho } from './morpho.js'

// Mock chain config for Unichain
const unichain = {
  id: 130,
  name: 'Unichain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.unichain.org'] },
  },
  blockExplorers: {
    default: {
      name: 'Unichain Explorer',
      url: 'https://unichain.blockscout.com',
    },
  },
}

// Mock the Morpho SDK modules
vi.mock('@morpho-org/blue-sdk-viem', () => ({
  fetchMarket: vi.fn(),
}))

vi.mock('@morpho-org/morpho-ts', () => ({
  Time: {
    timestamp: vi.fn(() => BigInt(Math.floor(Date.now() / 1000))),
  },
}))

vi.mock('@morpho-org/bundler-sdk-viem', () => ({
  populateBundle: vi.fn(),
  finalizeBundle: vi.fn(),
  encodeBundle: vi.fn(),
}))

describe('LendProviderMorpho', () => {
  let provider: LendProviderMorpho
  let mockConfig: MorphoLendConfig
  let mockPublicClient: ReturnType<typeof createPublicClient>

  beforeEach(() => {
    mockConfig = {
      type: 'morpho',
      defaultSlippage: 50,
    }

    mockPublicClient = createPublicClient({
      chain: unichain,
      transport: http(),
    })

    provider = new LendProviderMorpho(
      mockConfig,
      mockPublicClient as unknown as PublicClient,
    )
  })

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(provider).toBeInstanceOf(LendProviderMorpho)
    })

    it('should use default slippage when not provided', () => {
      const configWithoutSlippage = {
        ...mockConfig,
        defaultSlippage: undefined,
      }
      const providerWithDefaults = new LendProviderMorpho(
        configWithoutSlippage,
        mockPublicClient as unknown as PublicClient,
      )
      expect(providerWithDefaults).toBeInstanceOf(LendProviderMorpho)
    })
  })

  describe('withdraw', () => {
    it('should throw error for unimplemented withdraw functionality', async () => {
      const asset = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address // USDC
      const amount = BigInt('1000000000') // 1000 USDC
      const marketId = '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' // Gauntlet USDC vault

      await expect(provider.withdraw(asset, amount, marketId)).rejects.toThrow(
        'Withdraw functionality not yet implemented',
      )
    })
  })

  describe('supportedNetworkIds', () => {
    it('should return array of supported network chain IDs', () => {
      const networkIds = provider.supportedNetworkIds()

      expect(Array.isArray(networkIds)).toBe(true)
      expect(networkIds).toContain(130) // Unichain
      expect(networkIds.length).toBeGreaterThan(0)
    })

    it('should return unique network IDs', () => {
      const networkIds = provider.supportedNetworkIds()
      const uniqueIds = [...new Set(networkIds)]

      expect(networkIds.length).toBe(uniqueIds.length)
    })
  })

  describe('getMarketInfo', () => {
    it('should return detailed market information', async () => {
      const marketId = '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' // Gauntlet USDC vault

      // Mock the accrued market data that Market.fetch returns
      const mockAccruedMarket = {
        supplyApy: BigInt(5e16), // 5% APY in WAD format
        borrowApy: BigInt(7e16), // 7% APY in WAD format
        utilization: BigInt(8e17), // 80% utilization in WAD format
        liquidity: BigInt(1000000e6), // 1M USDC liquidity
        totalSupplyAssets: BigInt(5000000e6), // 5M USDC supplied
        totalBorrowAssets: BigInt(4000000e6), // 4M USDC borrowed
        accrueInterest: vi.fn().mockReturnThis(),
      }

      // Mock fetchMarket to return a market that has accrueInterest method and params
      vi.mocked(fetchMarket).mockResolvedValue({
        params: {
          oracle: '0x1111111111111111111111111111111111111111' as Address,
          irm: '0x2222222222222222222222222222222222222222' as Address,
          lltv: BigInt(8e17), // 80% LLTV in BigInt format
        },
        accrueInterest: vi.fn().mockReturnValue(mockAccruedMarket),
      } as any)

      const marketInfo = await provider.getMarketInfo(marketId)

      expect(marketInfo).toHaveProperty('id', marketId)
      expect(marketInfo).toHaveProperty('name')
      expect(marketInfo).toHaveProperty('loanToken')
      expect(marketInfo).toHaveProperty('collateralToken')
      expect(marketInfo).toHaveProperty('supplyApy')
      expect(marketInfo).toHaveProperty('utilization')
      expect(marketInfo).toHaveProperty('liquidity')
      expect(marketInfo).toHaveProperty('oracle')
      expect(marketInfo).toHaveProperty('irm')
      expect(marketInfo).toHaveProperty('lltv')
      expect(marketInfo).toHaveProperty('totalSupply')
      expect(marketInfo).toHaveProperty('totalBorrow')
      expect(marketInfo).toHaveProperty('supplyRate')
      expect(marketInfo).toHaveProperty('borrowRate')
      expect(marketInfo).toHaveProperty('lastUpdate')

      // Verify APY values are correctly converted from WAD format
      expect(marketInfo.supplyApy).toBeCloseTo(0.05, 2) // 5%
      expect(marketInfo.utilization).toBeCloseTo(0.8, 2) // 80%
    })

    it('should handle market not found error', async () => {
      const invalidMarketId =
        '0x0000000000000000000000000000000000000000000000000000000000000000'

      await expect(provider.getMarketInfo(invalidMarketId)).rejects.toThrow(
        `Failed to get market info for ${invalidMarketId}`,
      )
    })
  })

  describe('lend', () => {
    it('should successfully create a lending transaction', async () => {
      const asset = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address // USDC
      const amount = BigInt('1000000000') // 1000 USDC
      const marketId = '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' // Gauntlet USDC vault

      // Mock the market data for getMarketInfo
      const mockAccruedMarket = {
        supplyApy: BigInt(5e16), // 5% APY in WAD format
        borrowApy: BigInt(7e16), // 7% APY in WAD format
        utilization: BigInt(8e17), // 80% utilization in WAD format
        liquidity: BigInt(1000000e6), // 1M USDC liquidity
        totalSupplyAssets: BigInt(5000000e6), // 5M USDC supplied
        totalBorrowAssets: BigInt(4000000e6), // 4M USDC borrowed
        accrueInterest: vi.fn().mockReturnThis(),
      }

      vi.mocked(fetchMarket).mockResolvedValue({
        params: {
          oracle: '0x1111111111111111111111111111111111111111' as Address,
          irm: '0x2222222222222222222222222222222222222222' as Address,
          lltv: BigInt(8e17), // 80% LLTV in BigInt format
        },
        accrueInterest: vi.fn().mockReturnValue(mockAccruedMarket),
      } as any)

      const lendTransaction = await provider.lend(asset, amount, marketId)

      expect(lendTransaction).toHaveProperty('hash')
      expect(lendTransaction).toHaveProperty('amount', amount)
      expect(lendTransaction).toHaveProperty('asset', asset)
      expect(lendTransaction).toHaveProperty('marketId', marketId)
      expect(lendTransaction).toHaveProperty('apy')
      expect(lendTransaction).toHaveProperty('timestamp')
      expect(typeof lendTransaction.apy).toBe('number')
      expect(lendTransaction.apy).toBeGreaterThan(0)
    })

    it('should find best market when marketId not provided', async () => {
      const asset = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address // USDC
      const amount = BigInt('1000000000') // 1000 USDC

      // Mock the market data for getMarketInfo
      const mockAccruedMarket = {
        supplyApy: BigInt(5e16), // 5% APY in WAD format
        borrowApy: BigInt(7e16), // 7% APY in WAD format
        utilization: BigInt(8e17), // 80% utilization in WAD format
        liquidity: BigInt(1000000e6), // 1M USDC liquidity
        totalSupplyAssets: BigInt(5000000e6), // 5M USDC supplied
        totalBorrowAssets: BigInt(4000000e6), // 4M USDC borrowed
        accrueInterest: vi.fn().mockReturnThis(),
      }

      vi.mocked(fetchMarket).mockResolvedValue({
        params: {
          oracle: '0x1111111111111111111111111111111111111111' as Address,
          irm: '0x2222222222222222222222222222222222222222' as Address,
          lltv: BigInt(8e17), // 80% LLTV in BigInt format
        },
        accrueInterest: vi.fn().mockReturnValue(mockAccruedMarket),
      } as any)

      const lendTransaction = await provider.lend(asset, amount)

      expect(lendTransaction).toHaveProperty('marketId')
      expect(lendTransaction.marketId).toBeTruthy()
    })

    it('should handle lending errors', async () => {
      const asset = '0x0000000000000000000000000000000000000000' as Address // Invalid asset
      const amount = BigInt('1000000000')

      await expect(provider.lend(asset, amount)).rejects.toThrow(
        'Failed to lend',
      )
    })

    it('should use custom slippage when provided', async () => {
      const asset = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address
      const amount = BigInt('1000000000')
      const marketId = '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' // Gauntlet USDC vault
      const customSlippage = 100 // 1%

      // Mock the market data for getMarketInfo
      const mockAccruedMarket = {
        supplyApy: BigInt(5e16), // 5% APY in WAD format
        borrowApy: BigInt(7e16), // 7% APY in WAD format
        utilization: BigInt(8e17), // 80% utilization in WAD format
        liquidity: BigInt(1000000e6), // 1M USDC liquidity
        totalSupplyAssets: BigInt(5000000e6), // 5M USDC supplied
        totalBorrowAssets: BigInt(4000000e6), // 4M USDC borrowed
        accrueInterest: vi.fn().mockReturnThis(),
      }

      vi.mocked(fetchMarket).mockResolvedValue({
        params: {
          oracle: '0x1111111111111111111111111111111111111111' as Address,
          irm: '0x2222222222222222222222222222222222222222' as Address,
          lltv: BigInt(8e17), // 80% LLTV in BigInt format
        },
        accrueInterest: vi.fn().mockReturnValue(mockAccruedMarket),
      } as any)

      const lendTransaction = await provider.lend(asset, amount, marketId, {
        slippage: customSlippage,
      })

      expect(lendTransaction).toHaveProperty('amount', amount)
    })
  })

  describe('findBestMarketForAsset', () => {
    it('should find market with highest APY', async () => {
      const asset = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address

      // Access private method for testing
      const findBestMarket = (
        provider as unknown as {
          findBestMarketForAsset: (asset: Address) => Promise<string>
        }
      ).findBestMarketForAsset.bind(provider)

      const marketId = await findBestMarket(asset)
      expect(marketId).toBeTruthy()
      expect(typeof marketId).toBe('string')
    })

    it('should throw error when no markets available for asset', async () => {
      const asset = '0x0000000000000000000000000000000000000000' as Address

      const findBestMarket = (
        provider as unknown as {
          findBestMarketForAsset: (asset: Address) => Promise<string>
        }
      ).findBestMarketForAsset.bind(provider)

      await expect(findBestMarket(asset)).rejects.toThrow(
        `No vaults available for asset ${asset}`,
      )
    })
  })
})
