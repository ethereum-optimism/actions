import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createMockAaveReserve,
  createMockWETHReserve,
} from '@/lend/providers/aave/__mocks__/mockReserve.js'
import { AaveLendProvider } from '@/lend/providers/aave/AaveLendProvider.js'
import * as aaveSdk from '@/lend/providers/aave/sdk.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { MockReceiverAddress } from '@/test/MockMarkets.js'
import type { LendProviderConfig } from '@/types/actions.js'
import type { Asset, LendMarketConfig } from '@/types/index.js'

// Mock the Aave SDK modules
vi.mock('@/lend/providers/aave/sdk.js', () => ({
  getReserve: vi.fn(),
  getReserves: vi.fn(),
  getATokenAddress: vi.fn(),
}))

// Mock assets for Aave tests (using Base chain ID 8453)
const MockAaveUSDCAsset: Asset = {
  address: {
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  metadata: {
    decimals: 6,
    name: 'USD Coin',
    symbol: 'USDC',
  },
  type: 'erc20',
}

const MockAaveWETHAsset: Asset = {
  address: {
    8453: '0x4200000000000000000000000000000000000006',
  },
  metadata: {
    decimals: 18,
    name: 'Wrapped Ether',
    symbol: 'WETH',
  },
  type: 'erc20',
}

// Mock market configurations for Aave
const MockAaveUSDCMarket: LendMarketConfig = {
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  chainId: 8453, // Base
  name: 'Aave USDC Base',
  asset: MockAaveUSDCAsset,
  lendProvider: 'aave',
}

const MockAaveWETHMarket: LendMarketConfig = {
  address: '0x4200000000000000000000000000000000000006', // WETH predeploy
  chainId: 8453,
  name: 'Aave WETH Base',
  asset: MockAaveWETHAsset,
  lendProvider: 'aave',
}

describe('AaveLendProvider', () => {
  let provider: AaveLendProvider
  let mockConfig: LendProviderConfig
  let mockChainManager: ChainManager

  beforeEach(() => {
    mockConfig = {
      marketAllowlist: [MockAaveUSDCMarket, MockAaveWETHMarket],
    }

    mockChainManager = new MockChainManager({
      supportedChains: [8453],
    }) as unknown as ChainManager

    provider = new AaveLendProvider(mockConfig, mockChainManager)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(provider).toBeInstanceOf(AaveLendProvider)
    })
  })

  describe('supportedChainIds', () => {
    it('should return array of supported chain IDs', () => {
      const chainIds = provider.supportedChainIds()

      expect(Array.isArray(chainIds)).toBe(true)
      expect(chainIds).toContain(10) // Optimism
      expect(chainIds).toContain(8453) // Base
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
      const mockReserve = createMockAaveReserve()
      vi.mocked(aaveSdk.getReserve).mockResolvedValue(mockReserve)
    })

    it('should successfully create a lending transaction for ERC20', async () => {
      const amount = 1000
      const asset = MockAaveUSDCAsset
      const marketId = {
        address: MockAaveUSDCMarket.address,
        chainId: MockAaveUSDCMarket.chainId,
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

    it('should create WETH deposit without approval', async () => {
      const mockWETHReserve = createMockWETHReserve()
      vi.mocked(aaveSdk.getReserve).mockResolvedValue(mockWETHReserve)

      const amount = 1
      const asset = MockAaveWETHAsset
      const marketId = {
        address: MockAaveWETHMarket.address,
        chainId: MockAaveWETHMarket.chainId,
      }

      const lendTransaction = await provider.openPosition({
        amount,
        asset,
        marketId,
        walletAddress: MockReceiverAddress,
      })

      expect(lendTransaction).toHaveProperty(
        'amount',
        BigInt('1000000000000000000'),
      )
      expect(lendTransaction.transactionData).not.toHaveProperty('approval')
      expect(lendTransaction.transactionData).toHaveProperty('openPosition')
      // WETH deposits send ETH as msg.value
      expect(lendTransaction.transactionData?.openPosition?.value).toBe(
        BigInt('1000000000000000000'),
      )
    })

    it('should handle lending errors', async () => {
      vi.mocked(aaveSdk.getReserve).mockRejectedValueOnce(
        new Error('Market fetch failed'),
      )

      const asset = MockAaveUSDCAsset
      const amount = 1000
      const marketId = {
        address: MockAaveUSDCMarket.address,
        chainId: MockAaveUSDCMarket.chainId,
      }

      await expect(
        provider.openPosition({
          amount,
          asset,
          marketId,
          walletAddress: MockReceiverAddress,
        }),
      ).rejects.toThrow('Failed to open position')
    })

    it('should use custom slippage when provided', async () => {
      const amount = 1000
      const asset = MockAaveUSDCAsset
      const marketId = {
        address: MockAaveUSDCMarket.address,
        chainId: MockAaveUSDCMarket.chainId,
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

      expect(lendTransaction.slippage).toBe(customSlippage)
    })
  })

  describe('closePosition', () => {
    beforeEach(() => {
      const mockReserve = createMockAaveReserve()
      vi.mocked(aaveSdk.getReserve).mockResolvedValue(mockReserve)
    })

    it('should successfully create a withdrawal transaction for ERC20', async () => {
      const amount = 500
      const asset = MockAaveUSDCAsset
      const marketId = {
        address: MockAaveUSDCMarket.address,
        chainId: MockAaveUSDCMarket.chainId,
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

    it('should create WETH withdrawal with approval', async () => {
      const mockWETHReserve = createMockWETHReserve()
      vi.mocked(aaveSdk.getReserve).mockResolvedValue(mockWETHReserve)
      vi.mocked(aaveSdk.getATokenAddress).mockResolvedValue(
        '0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7',
      )

      const amount = 1
      const asset = MockAaveWETHAsset
      const marketId = {
        address: MockAaveWETHMarket.address,
        chainId: MockAaveWETHMarket.chainId,
      }

      const withdrawTransaction = await provider.closePosition({
        amount,
        asset,
        marketId,
        walletAddress: MockReceiverAddress,
      })

      expect(withdrawTransaction).toHaveProperty(
        'amount',
        BigInt('1000000000000000000'),
      )
      // WETH withdrawals require approving aWETH to WETHGateway
      expect(withdrawTransaction.transactionData).toHaveProperty('approval')
      expect(withdrawTransaction.transactionData).toHaveProperty(
        'closePosition',
      )
    })

    it('should handle withdrawal errors', async () => {
      vi.mocked(aaveSdk.getReserve).mockRejectedValueOnce(
        new Error('Market fetch failed'),
      )

      const amount = 500
      const asset = MockAaveUSDCAsset
      const marketId = {
        address: MockAaveUSDCMarket.address,
        chainId: MockAaveUSDCMarket.chainId,
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

  describe('market allowlist configuration', () => {
    it('should work without market allowlist', () => {
      const configWithoutAllowlist: LendProviderConfig = {}

      const providerWithoutAllowlist = new AaveLendProvider(
        configWithoutAllowlist,
        mockChainManager,
      )

      expect(providerWithoutAllowlist.config.marketAllowlist).toBeUndefined()
    })

    it('should store market allowlist when provided', () => {
      const configWithAllowlist: LendProviderConfig = {
        marketAllowlist: [MockAaveUSDCMarket],
      }

      const providerWithAllowlist = new AaveLendProvider(
        configWithAllowlist,
        mockChainManager,
      )

      const allowlist = providerWithAllowlist.config.marketAllowlist
      expect(allowlist).toBeDefined()
      expect(allowlist).toHaveLength(1)
      expect(allowlist![0].address).toBe(MockAaveUSDCMarket.address)
      expect(allowlist![0].name).toBe(MockAaveUSDCMarket.name)
    })

    it('should handle multiple markets in allowlist', () => {
      const configWithMultipleMarkets: LendProviderConfig = {
        marketAllowlist: [MockAaveUSDCMarket, MockAaveWETHMarket],
      }

      const providerInstance = new AaveLendProvider(
        configWithMultipleMarkets,
        mockChainManager,
      )

      const allowlist = providerInstance.config.marketAllowlist
      expect(allowlist).toBeDefined()
      expect(allowlist).toHaveLength(2)
      expect(allowlist![0].name).toBe(MockAaveUSDCMarket.name)
      expect(allowlist![1].name).toBe(MockAaveWETHMarket.name)
    })
  })

  describe('unsupported chain handling', () => {
    it('should throw error for unsupported chain', async () => {
      // Use type assertion to test runtime behavior with unsupported chain
      const unsupportedChainId = 999999 as 8453
      const unsupportedMarket: LendMarketConfig = {
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        chainId: unsupportedChainId,
        name: 'Unsupported Market',
        asset: MockAaveUSDCAsset,
        lendProvider: 'aave',
      }

      const configWithUnsupported: LendProviderConfig = {
        marketAllowlist: [unsupportedMarket],
      }

      const providerWithUnsupported = new AaveLendProvider(
        configWithUnsupported,
        mockChainManager,
      )

      await expect(
        providerWithUnsupported.openPosition({
          amount: 100,
          asset: MockAaveUSDCAsset,
          marketId: {
            address: unsupportedMarket.address,
            chainId: unsupportedMarket.chainId,
          },
          walletAddress: MockReceiverAddress,
        }),
      ).rejects.toThrow('not supported')
    })
  })
})
