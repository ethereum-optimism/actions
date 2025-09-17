import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import { MockLendProvider } from '@/test/MockLendProvider.js'

import type {
  BaseLendConfig,
  LendMarketConfig,
  LendMarketId,
} from '../types/lend.js'

describe('LendProvider', () => {
  describe('constructor and configuration', () => {
    it('should initialize with basic config', () => {
      const config: BaseLendConfig = {
        defaultSlippage: 100,
      }

      const provider = new MockLendProvider(config)
      expect(provider).toBeDefined()
      expect(provider.supportedNetworkIds()).toContain(84532)
    })

    it('should use default slippage when not provided', () => {
      const config: BaseLendConfig = {}
      const provider = new MockLendProvider(config)

      expect(provider['defaultSlippage']).toBe(50)
    })

    it('should use custom default slippage when provided', () => {
      const config: BaseLendConfig = {
        defaultSlippage: 200,
      }
      const provider = new MockLendProvider(config)

      expect(provider['defaultSlippage']).toBe(200)
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

      const config: BaseLendConfig = {
        marketAllowlist: [mockMarket],
      }

      const provider = new MockLendProvider(config)
      expect(provider['marketAllowlist']).toEqual([mockMarket])
    })
  })

  describe('abstract methods implementation', () => {
    it('should implement lend method', async () => {
      const provider = new MockLendProvider({})
      const result = await provider.lend(
        '0x0000000000000000000000000000000000000001' as Address,
        1000n,
        'market-1',
        { slippage: 150 },
      )

      expect(result.amount).toBe(1000n)
      expect(result.marketId).toBe('market-1')
      expect(result.slippage).toBe(150)
    })

    it('should implement deposit method (alias for lend)', async () => {
      const provider = new MockLendProvider({})
      const result = await provider.deposit(
        '0x0000000000000000000000000000000000000001' as Address,
        2000n,
      )

      expect(result.amount).toBe(2000n)
      expect(result.marketId).toBe('mock-market')
    })

    it('should implement getMarket method', async () => {
      const provider = new MockLendProvider({})
      const marketId: LendMarketId = {
        address: '0x1234' as Address,
        chainId: 84532,
      }

      const market = await provider.getMarket(marketId)
      expect(market.chainId).toBe(84532)
      expect(market.name).toBe('Mock Market')
      expect(market.apy).toBe(0.05)
    })

    it('should implement getMarkets method', async () => {
      const provider = new MockLendProvider({})
      const markets = await provider.getMarkets()

      expect(Array.isArray(markets)).toBe(true)
      expect(markets).toHaveLength(1)
      expect(markets[0].name).toBe('Mock Market')
    })

    it('should implement getMarketBalance method', async () => {
      const provider = new MockLendProvider({})
      const balance = await provider.getMarketBalance(
        '0x1234' as Address,
        '0x5678' as Address,
      )

      expect(balance.balance).toBe(500000n)
      expect(balance.shares).toBe(500000n)
      expect(balance.chainId).toBe(84532)
    })

    it('should implement withdraw method', async () => {
      const provider = new MockLendProvider({})
      const result = await provider.withdraw(
        '0x0000000000000000000000000000000000000001' as Address,
        500n,
        'market-2',
      )

      expect(result.amount).toBe(500n)
      expect(result.marketId).toBe('market-2')
    })
  })

  describe('supportedNetworkIds', () => {
    it('should return array of supported network IDs', () => {
      const provider = new MockLendProvider({})
      const networkIds = provider.supportedNetworkIds()

      expect(Array.isArray(networkIds)).toBe(true)
      expect(networkIds).toContain(84532)
      expect(networkIds).toHaveLength(1)
    })
  })

  describe('protected getters', () => {
    it('should provide access to defaultSlippage via getter', () => {
      const config: BaseLendConfig = {
        defaultSlippage: 75,
      }
      const provider = new MockLendProvider(config)

      expect(provider['defaultSlippage']).toBe(75)
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

      const config: BaseLendConfig = {
        marketAllowlist: [mockMarket],
      }
      const provider = new MockLendProvider(config)

      expect(provider['marketAllowlist']).toEqual([mockMarket])
    })

    it('should return undefined for marketAllowlist when not provided', () => {
      const provider = new MockLendProvider({})
      expect(provider['marketAllowlist']).toBeUndefined()
    })
  })
})
