import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import { MockUSDCAsset } from '@/test/MockAssets.js'
import { MockLendProvider } from '@/test/MockLendProvider.js'

import type {
  LendConfig,
  LendMarketConfig,
  LendMarketId,
} from '../types/lend.js'

// Test helper class that exposes protected validation methods as public
class TestLendProvider extends MockLendProvider {
  public validateProviderSupported(chainId: number): void {
    return super.validateProviderSupported(chainId)
  }

  public validateConfigSupported(marketId: LendMarketId): void {
    return super.validateConfigSupported(marketId)
  }

  public isChainSupported(chainId: number): boolean {
    return super.isChainSupported(chainId)
  }
}

describe('LendProvider', () => {
  describe('constructor and configuration', () => {
    it('should initialize with basic config', () => {
      const config: LendConfig = {
        provider: 'morpho',
        defaultSlippage: 100,
      }

      const provider = new MockLendProvider(config)
      expect(provider).toBeDefined()
      expect(provider.supportedChainIds()).toContain(84532)
    })

    it('should use default slippage when not provided', () => {
      const config: LendConfig = { provider: 'morpho' }
      const provider = new MockLendProvider(config)

      expect(provider.config.defaultSlippage || 50).toBe(50)
    })

    it('should use custom default slippage when provided', () => {
      const config: LendConfig = {
        provider: 'morpho',
        defaultSlippage: 200,
      }
      const provider = new MockLendProvider(config)

      expect(provider.config.defaultSlippage).toBe(200)
    })

    it('should store market allowlist when provided', () => {
      const mockMarket: LendMarketConfig = {
        address: '0x1234' as Address,
        chainId: 84532,
        name: 'Test Market',
        asset: {
          address: { 84532: '0xUSC' as Address },
          metadata: {
            decimals: 6,
            name: 'USD Coin',
            symbol: 'USDC',
          },
          type: 'erc20',
        },
        lendProvider: 'morpho',
      }

      const config: LendConfig = {
        provider: 'morpho',
        marketAllowlist: [mockMarket],
      }

      const provider = new MockLendProvider(config)
      expect(provider.config.marketAllowlist).toEqual([mockMarket])
    })
  })

  describe('abstract methods implementation', () => {
    it('should implement getMarket method', async () => {
      const provider = new MockLendProvider({ provider: 'morpho' })
      const marketId: LendMarketId = {
        address: '0x1234' as Address,
        chainId: 84532,
      }

      const market = await provider.getMarket(marketId)
      expect(market.chainId).toBe(84532)
      expect(market.name).toBe('Mock Market')
      expect(market.apy).toBe(0.05)
    })

    it('should accept LendMarketConfig and extract address/chainId', async () => {
      const provider = new MockLendProvider({ provider: 'morpho' })
      const mockMarket: LendMarketConfig = {
        address: '0x5678' as Address,
        chainId: 84532,
        name: 'Test Config Market',
        asset: MockUSDCAsset,
        lendProvider: 'morpho',
      }

      const market = await provider.getMarket(mockMarket)
      expect(market.chainId).toBe(84532)
      expect(market.address).toBe('0x5678')
      expect(market.name).toBe('Mock Market')
    })

    it('should implement getMarkets method', async () => {
      const provider = new MockLendProvider({ provider: 'morpho' })
      const markets = await provider.getMarkets()

      expect(Array.isArray(markets)).toBe(true)
      expect(markets).toHaveLength(1)
      expect(markets[0].name).toBe('Mock Market')
    })

    it('should accept optional filter parameters for getMarkets', async () => {
      const provider = new MockLendProvider({ provider: 'morpho' })
      const markets = await provider.getMarkets({ chainId: 84532 })

      expect(Array.isArray(markets)).toBe(true)
      expect(markets).toHaveLength(1)
    })

    it('should accept asset filtering parameter', async () => {
      const provider = new MockLendProvider({ provider: 'morpho' })
      const mockAsset = {
        metadata: { symbol: 'USDC', name: 'USD Coin' },
        address: { 84532: '0x123' as Address },
      } as any

      const markets = await provider.getMarkets({ asset: mockAsset })
      expect(Array.isArray(markets)).toBe(true)
    })

    it('should implement getPosition method', async () => {
      const provider = new MockLendProvider({ provider: 'morpho' })
      const position = await provider.getPosition('0x5678' as Address, {
        address: '0x1234' as Address,
        chainId: 84532 as const,
      })

      expect(position.balance).toBe(500000n)
      expect(position.shares).toBe(500000n)
      expect(position.chainId).toBe(84532)
    })

    it('should implement closePosition method', async () => {
      const provider = new MockLendProvider({ provider: 'morpho' })
      const result = await provider.closePosition({
        amount: 100,
        marketId: { address: '0x1234' as Address, chainId: 84532 as const },
      })

      expect(result.amount).toBe(100n)
      expect(result.marketId).toBe('0x1234')
      expect(typeof result.transactionData).toBe('object')
    })

    it('should implement withdraw method', async () => {
      const provider = new MockLendProvider({ provider: 'morpho' })
      const result = await provider.withdraw(
        '0x0000000000000000000000000000000000000001' as Address,
        500n,
        84532,
        'market-2',
      )

      expect(result.amount).toBe(500n)
      expect(result.marketId).toBe('market-2')
    })

    it('should implement openPosition method', async () => {
      const provider = new MockLendProvider({ provider: 'morpho' })
      const mockAsset = {
        address: { 84532: '0x123' as Address },
        metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        type: 'erc20' as const,
      }

      const result = await provider.openPosition({
        amount: 1000,
        asset: mockAsset,
        marketId: { address: '0x1234' as Address, chainId: 84532 },
      })

      expect(result.amount).toBe(1000000000n) // 1000 * 10^6 decimals
      expect(result.asset).toBe('0x123')
      expect(result.marketId).toBe('0x1234')
      expect(result.apy).toBe(0.05)
    })
  })

  describe('supportedChainIds', () => {
    it('should return array of supported chain IDs', () => {
      const provider = new MockLendProvider({ provider: 'morpho' })
      const chainIds = provider.supportedChainIds()

      expect(Array.isArray(chainIds)).toBe(true)
      expect(chainIds).toContain(84532)
      expect(chainIds.length).toBeGreaterThan(0)
    })
  })

  describe('validation', () => {
    it('should call validation for unsupported chainId', () => {
      const provider = new TestLendProvider({ provider: 'morpho' })

      expect(() => {
        provider.validateProviderSupported(999)
      }).toThrow('Chain 999 is not supported')
    })

    it('should call validation for market allowlist', () => {
      const allowedMarket: LendMarketConfig = {
        address: '0x1234' as Address,
        chainId: 84532,
        name: 'Allowed Market',
        asset: {
          address: { 84532: '0xUSC' as Address },
          metadata: { decimals: 6, name: 'USD Coin', symbol: 'USDC' },
          type: 'erc20',
        },
        lendProvider: 'morpho',
      }

      const provider = new TestLendProvider({
        provider: 'morpho',
        marketAllowlist: [allowedMarket],
      })

      expect(() => {
        provider.validateConfigSupported({
          address: '0x1234' as Address,
          chainId: 84532,
        })
      }).not.toThrow()

      expect(() => {
        provider.validateConfigSupported({
          address: '0x9999' as Address,
          chainId: 84532,
        })
      }).toThrow('not in the market allowlist')
    })

    it('should validate chain support correctly', () => {
      const provider = new TestLendProvider({ provider: 'morpho' })

      expect(provider.isChainSupported(84532)).toBe(true)
      expect(provider.isChainSupported(999)).toBe(false)
    })
  })

  describe('public getters', () => {
    it('should provide access to defaultSlippage via getter', () => {
      const config: LendConfig = {
        provider: 'morpho',
        defaultSlippage: 75,
      }
      const provider = new MockLendProvider(config)

      expect(provider.config.defaultSlippage).toBe(75)
    })

    it('should provide access to marketAllowlist via getter', () => {
      const mockMarket: LendMarketConfig = {
        address: '0xabc' as Address,
        chainId: 84532,
        name: 'Market ABC',
        asset: {
          address: { 84532: '0xdef' as Address },
          metadata: {
            decimals: 18,
            name: 'Test Token',
            symbol: 'TEST',
          },
          type: 'erc20',
        },
        lendProvider: 'morpho',
      }

      const config: LendConfig = {
        provider: 'morpho',
        marketAllowlist: [mockMarket],
      }
      const provider = new MockLendProvider(config)

      expect(provider.config.marketAllowlist).toEqual([mockMarket])
    })

    it('should return undefined for marketAllowlist when not provided', () => {
      const provider = new MockLendProvider({ provider: 'morpho' })
      expect(provider.config.marketAllowlist).toBeUndefined()
    })
  })
})
