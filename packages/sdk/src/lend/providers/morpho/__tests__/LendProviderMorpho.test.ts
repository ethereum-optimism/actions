import { fetchAccrualVault } from '@morpho-org/blue-sdk-viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import {
  MockGauntletUSDCMarket,
  MockReceiverAddress,
  MockWETHMarket,
} from '@/test/MockMarkets.js'
import type { MorphoLendConfig } from '@/types/lend/index.js'

import { createMockMorphoVault } from '../__mocks__/mockVault.js'
import { LendProviderMorpho } from '../LendProviderMorpho.js'

// Mock the Morpho SDK modules
vi.mock('@morpho-org/blue-sdk-viem', () => ({
  fetchMarket: vi.fn(),
  fetchAccrualVault: vi.fn(),
  MetaMorphoAction: {
    deposit: vi.fn(() => '0x1234567890abcdef'),
    withdraw: vi.fn(() => '0xabcdef1234567890'),
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
    beforeEach(() => {
      const mockVault = createMockMorphoVault()

      vi.mocked(fetchAccrualVault).mockResolvedValue(mockVault as any)

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

    it('should successfully create a withdrawal transaction', async () => {
      const amount = 500
      const asset = MockGauntletUSDCMarket.asset
      const marketId = {
        address: MockGauntletUSDCMarket.address,
        chainId: MockGauntletUSDCMarket.chainId,
      }
      const walletAddress = MockReceiverAddress

      const withdrawTransaction = await provider.closePosition({
        amount,
        asset,
        marketId,
        walletAddress,
      })

      expect(withdrawTransaction).toHaveProperty('amount', BigInt('500000000'))
      expect(withdrawTransaction).toHaveProperty(
        'asset',
        asset.address[marketId.chainId],
      )
      expect(withdrawTransaction).toHaveProperty('marketId', marketId.address)
      expect(withdrawTransaction).toHaveProperty('apy')
      expect(withdrawTransaction).toHaveProperty('transactionData')
      expect(withdrawTransaction.transactionData).toHaveProperty(
        'closePosition',
      )
      expect(withdrawTransaction.transactionData).not.toHaveProperty('approval')
      expect(typeof withdrawTransaction.apy).toBe('number')
      expect(withdrawTransaction.apy).toBeGreaterThan(0)
    })

    it('should handle withdrawal errors', async () => {
      vi.spyOn(provider as any, '_getMarket').mockRejectedValueOnce(
        new Error('Market fetch failed'),
      )

      const amount = 500
      const asset = MockGauntletUSDCMarket.asset
      const marketId = {
        address: MockGauntletUSDCMarket.address,
        chainId: MockGauntletUSDCMarket.chainId,
      }
      const walletAddress = MockReceiverAddress

      await expect(
        provider.closePosition({
          amount,
          asset,
          marketId,
          walletAddress,
        }),
      ).rejects.toThrow('Market fetch failed')
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
      const mockVault = createMockMorphoVault()

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
        walletAddress: MockReceiverAddress,
      })

      expect(lendTransaction).toHaveProperty('amount', BigInt('1000000000'))
      expect(lendTransaction).toHaveProperty(
        'asset',
        asset.address[marketId.chainId],
      )
      expect(lendTransaction).toHaveProperty('marketId', marketId.address)
      expect(lendTransaction).toHaveProperty('apy')
      expect(lendTransaction).toHaveProperty('transactionData')
      expect(lendTransaction.transactionData).toHaveProperty('approval')
      expect(lendTransaction.transactionData).toHaveProperty('openPosition')
      expect(typeof lendTransaction.apy).toBe('number')
      expect(lendTransaction.apy).toBeGreaterThan(0)
    })

    it('should handle lending errors', async () => {
      vi.spyOn(provider as any, '_getMarket').mockRejectedValueOnce(
        new Error('Market fetch failed'),
      )

      const asset = MockGauntletUSDCMarket.asset
      const amount = 1000
      const marketId = {
        address: MockGauntletUSDCMarket.address,
        chainId: MockGauntletUSDCMarket.chainId,
      }

      await expect(
        provider.openPosition({
          amount,
          asset,
          marketId,
          walletAddress: MockReceiverAddress,
        }),
      ).rejects.toThrow('Market fetch failed')
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
        walletAddress: MockReceiverAddress,
        options: {
          slippage: customSlippage,
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
