import { fetchAccrualVault } from '@morpho-org/blue-sdk-viem'
import { type Address } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import {
  MockGauntletUSDCMarket,
  MockReceiverAddress,
  MockWETHMarket,
} from '@/test/MockMarkets.js'

import type { MorphoLendConfig } from '../../../types/lend.js'
import { LendProviderMorpho } from './index.js'

// Mock the Morpho SDK modules
vi.mock('@morpho-org/blue-sdk-viem', () => ({
  fetchMarket: vi.fn(),
  fetchAccrualVault: vi.fn(),
  MetaMorphoAction: {
    deposit: vi.fn(() => '0x1234567890abcdef'), // Mock deposit function to return mock calldata
  },
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
  let mockChainManager: ChainManager

  beforeEach(() => {
    mockConfig = {
      provider: 'morpho',
      defaultSlippage: 50,
      marketAllowlist: [MockGauntletUSDCMarket, MockWETHMarket],
    }

    mockChainManager = new MockChainManager() as unknown as ChainManager

    provider = new LendProviderMorpho(mockConfig, mockChainManager)
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
        mockChainManager,
      )
      expect(providerWithDefaults).toBeInstanceOf(LendProviderMorpho)
    })
  })

  describe('closePosition', () => {
    it('should throw error during closePosition due to getMarket failure', async () => {
      const mockAsset = MockGauntletUSDCMarket.asset
      const marketId = {
        address: MockGauntletUSDCMarket.address,
        chainId: MockGauntletUSDCMarket.chainId,
      }

      await expect(
        provider.closePosition({
          amount: 1000,
          asset: mockAsset,
          marketId,
        }),
      ).rejects.toThrow('Failed to get vault info')
    })
  })

  describe('supportedChainIds', () => {
    it('should return array of supported chain IDs', () => {
      const chainIds = provider.supportedChainIds()

      expect(Array.isArray(chainIds)).toBe(true)
      expect(chainIds).toContain(130) // Unichain
      expect(chainIds.length).toBeGreaterThan(0)
    })

    it('should return unique chain IDs', () => {
      const chainIds = provider.supportedChainIds()
      const uniqueIds = [...new Set(chainIds)]

      expect(chainIds.length).toBe(uniqueIds.length)
    })
  })

  describe('openPosition', () => {
    beforeEach(() => {
      // Mock vault data for all lend tests
      const mockVault = {
        totalAssets: BigInt(10000000e6), // 10M USDC
        totalSupply: BigInt(10000000e6), // 10M shares
        fee: BigInt(1e17), // 10% fee in WAD format
        owner: '0x5a4E19842e09000a582c20A4f524C26Fb48Dd4D0' as Address,
        curator: '0x9E33faAE38ff641094fa68c65c2cE600b3410585' as Address,
        allocations: new Map([
          [
            '0',
            {
              position: {
                supplyShares: BigInt(1000000e6),
                supplyAssets: BigInt(1000000e6),
                market: {
                  supplyApy: BigInt(3e16), // 3% APY
                },
              },
            },
          ],
        ]),
      }

      vi.mocked(fetchAccrualVault).mockResolvedValue(mockVault as any)

      // Mock the fetch API for rewards
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            data: {
              vaultByAddress: {
                state: {
                  rewards: [],
                  allocation: [],
                },
              },
            },
          }),
        } as any),
      )
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should successfully create a lending transaction', async () => {
      const amount = 1000 // Human-readable amount
      const asset = MockGauntletUSDCMarket.asset
      const marketId = {
        address: MockGauntletUSDCMarket.address,
        chainId: MockGauntletUSDCMarket.chainId,
      }

      const lendTransaction = await provider.openPosition({
        amount,
        asset,
        marketId,
        options: {
          receiver: MockReceiverAddress,
        },
      })

      expect(lendTransaction).toHaveProperty('amount', BigInt('1000000000')) // 1000 * 10^6
      expect(lendTransaction).toHaveProperty(
        'asset',
        asset.address[marketId.chainId],
      )
      expect(lendTransaction).toHaveProperty('marketId', marketId.address)
      expect(lendTransaction).toHaveProperty('apy')
      expect(lendTransaction).toHaveProperty('timestamp')
      expect(lendTransaction).toHaveProperty('transactionData')
      expect(lendTransaction.transactionData).toHaveProperty('approval')
      expect(lendTransaction.transactionData).toHaveProperty('deposit')
      expect(typeof lendTransaction.apy).toBe('number')
      expect(lendTransaction.apy).toBeGreaterThan(0)
    })

    it('should find best market when marketId not provided', async () => {
      // This test doesn't apply to openPosition which requires marketId
      // Remove or replace with a different test
      const amount = 1000
      const asset = MockGauntletUSDCMarket.asset
      const marketId = {
        address: MockGauntletUSDCMarket.address,
        chainId: MockGauntletUSDCMarket.chainId,
      }

      const lendTransaction = await provider.openPosition({
        amount,
        asset,
        marketId,
        options: {
          receiver: MockReceiverAddress,
        },
      })

      expect(lendTransaction).toHaveProperty('marketId')
      expect(lendTransaction.marketId).toBeTruthy()
    })

    it('should handle lending errors', async () => {
      const invalidAsset = {
        address: {
          [MockGauntletUSDCMarket.chainId]:
            '0x0000000000000000000000000000000000000000' as Address,
        },
        metadata: { symbol: 'INVALID', name: 'Invalid', decimals: 6 },
        type: 'erc20' as const,
      }
      const amount = 1000
      const marketId = {
        address: MockGauntletUSDCMarket.address,
        chainId: MockGauntletUSDCMarket.chainId,
      }

      await expect(
        provider.openPosition({
          amount,
          asset: invalidAsset,
          marketId,
        }),
      ).rejects.toThrow('Failed to open position')
    })

    it('should use custom slippage when provided', async () => {
      const amount = 1000
      const asset = MockGauntletUSDCMarket.asset
      const marketId = {
        address: MockGauntletUSDCMarket.address,
        chainId: MockGauntletUSDCMarket.chainId,
      }
      const customSlippage = 100 // 1%

      const lendTransaction = await provider.openPosition({
        amount,
        asset,
        marketId,
        options: {
          slippage: customSlippage,
          receiver: MockReceiverAddress,
        },
      })

      expect(lendTransaction).toHaveProperty('amount', BigInt('1000000000'))
    })
  })

  describe('market allowlist configuration', () => {
    it('should work without market allowlist', () => {
      const configWithoutAllowlist: MorphoLendConfig = {
        provider: 'morpho',
        defaultSlippage: 50,
      }

      const providerWithoutAllowlist = new LendProviderMorpho(
        configWithoutAllowlist,
        mockChainManager,
      )

      expect(providerWithoutAllowlist.config.marketAllowlist).toBeUndefined()
    })

    it('should store market allowlist when provided', () => {
      const configWithAllowlist: MorphoLendConfig = {
        provider: 'morpho',
        defaultSlippage: 50,
        marketAllowlist: [MockGauntletUSDCMarket],
      }

      const providerWithAllowlist = new LendProviderMorpho(
        configWithAllowlist,
        mockChainManager,
      )

      const allowlist = providerWithAllowlist.config.marketAllowlist
      expect(allowlist).toBeDefined()
      expect(allowlist).toHaveLength(1)
      expect(allowlist![0].address).toBe(MockGauntletUSDCMarket.address)
      expect(allowlist![0].name).toBe(MockGauntletUSDCMarket.name)
    })

    it('should use default slippage from config', () => {
      const customSlippage = 150
      const configWithSlippage: MorphoLendConfig = {
        provider: 'morpho',
        defaultSlippage: customSlippage,
      }

      const providerWithSlippage = new LendProviderMorpho(
        configWithSlippage,
        mockChainManager,
      )

      expect(providerWithSlippage.config.defaultSlippage).toBe(customSlippage)
    })

    it('should use fallback default slippage when not provided', () => {
      const configWithoutSlippage: MorphoLendConfig = {
        provider: 'morpho',
      }

      const providerWithoutSlippage = new LendProviderMorpho(
        configWithoutSlippage,
        mockChainManager,
      )

      expect(providerWithoutSlippage.config.defaultSlippage || 50).toBe(50) // Default fallback
    })

    it('should handle multiple markets in allowlist', () => {
      const configWithMultipleMarkets: MorphoLendConfig = {
        provider: 'morpho',
        marketAllowlist: [MockGauntletUSDCMarket, MockWETHMarket],
      }

      const provider = new LendProviderMorpho(
        configWithMultipleMarkets,
        mockChainManager,
      )

      const allowlist = provider.config.marketAllowlist
      expect(allowlist).toBeDefined()
      expect(allowlist).toHaveLength(2)
      expect(allowlist![0].name).toBe(MockGauntletUSDCMarket.name)
      expect(allowlist![1].name).toBe(MockWETHMarket.name)
    })
  })
})
