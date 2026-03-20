import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { MockSwapProvider } from '@/swap/__mocks__/MockSwapProvider.js'
import type { Asset } from '@/types/asset.js'
import type { SwapMarketConfig } from '@/types/swap/index.js'

// Test assets
const MockUSDC: Asset = {
  type: 'erc20',
  address: { 84532: '0x1111111111111111111111111111111111111111' as Address },
  metadata: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
}

const MockWETH: Asset = {
  type: 'erc20',
  address: { 84532: '0x2222222222222222222222222222222222222222' as Address },
  metadata: { name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
}

const MockOP: Asset = {
  type: 'erc20',
  address: { 84532: '0x3333333333333333333333333333333333333333' as Address },
  metadata: { name: 'Optimism', symbol: 'OP', decimals: 18 },
}

describe('SwapProvider', () => {
  describe('constructor and configuration', () => {
    it('should initialize with default config', () => {
      const provider = new MockSwapProvider()
      expect(provider).toBeDefined()
      expect(provider.supportedChainIds()).toContain(84532)
    })

    it('should use default slippage when not configured', () => {
      const provider = new MockSwapProvider()
      expect(provider.defaultSlippage).toBe(0.005)
    })

    it('should use config slippage when provided', () => {
      const provider = new MockSwapProvider({ defaultSlippage: 0.01 })
      expect(provider.defaultSlippage).toBe(0.01)
    })

    it('should store market allowlist when provided', () => {
      const config: SwapMarketConfig = {
        assets: [MockUSDC, MockWETH],
        chainId: 84532 as SupportedChainId,
      }
      const provider = new MockSwapProvider({ marketAllowlist: [config] })
      expect(provider.config.marketAllowlist).toEqual([config])
    })
  })

  describe('execute()', () => {
    it('should throw if neither amountIn nor amountOut provided', async () => {
      const provider = new MockSwapProvider()
      await expect(
        provider.execute({
          assetIn: MockUSDC,
          assetOut: MockWETH,
          chainId: 84532 as SupportedChainId,
          walletAddress: '0x1234' as Address,
        }),
      ).rejects.toThrow('Either amountIn or amountOut must be provided')
    })

    it('should throw if chain not supported', async () => {
      const provider = new MockSwapProvider()
      await expect(
        provider.execute({
          amountIn: 100,
          assetIn: MockUSDC,
          assetOut: MockWETH,
          chainId: 999 as SupportedChainId,
          walletAddress: '0x1234' as Address,
        }),
      ).rejects.toThrow('Chain 999 is not supported')
    })

    it('should throw if asset not supported on chain', async () => {
      const unsupportedAsset: Asset = {
        type: 'erc20',
        address: { 1: '0x1111' as Address }, // Only on mainnet
        metadata: { name: 'Test', symbol: 'TEST', decimals: 18 },
      }
      const provider = new MockSwapProvider()
      await expect(
        provider.execute({
          amountIn: 100,
          assetIn: unsupportedAsset,
          assetOut: MockWETH,
          chainId: 84532 as SupportedChainId,
          walletAddress: '0x1234' as Address,
        }),
      ).rejects.toThrow('not supported on chain')
    })

    it('should use param slippage over config default', async () => {
      const provider = new MockSwapProvider({ defaultSlippage: 0.01 })
      const result = await provider.execute({
        amountIn: 100,
        assetIn: MockUSDC,
        assetOut: MockWETH,
        chainId: 84532 as SupportedChainId,
        walletAddress: '0x1234' as Address,
        slippage: 0.02,
      })
      expect(result).toBeDefined()
      // Slippage is passed to internal params
      expect(provider.mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({ slippage: 0.02 }),
      )
    })

    it('should use default deadline when not specified', async () => {
      const provider = new MockSwapProvider()
      const beforeTime = Math.floor(Date.now() / 1000)
      await provider.execute({
        amountIn: 100,
        assetIn: MockUSDC,
        assetOut: MockWETH,
        chainId: 84532 as SupportedChainId,
        walletAddress: '0x1234' as Address,
      })
      const afterTime = Math.floor(Date.now() / 1000) + 60

      expect(provider.mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          deadline: expect.any(Number),
        }),
      )
      const call = provider.mockExecute.mock.calls[0][0]
      expect(call.deadline).toBeGreaterThanOrEqual(beforeTime + 60)
      expect(call.deadline).toBeLessThanOrEqual(afterTime)
    })

    it('should convert human-readable amounts to wei', async () => {
      const provider = new MockSwapProvider()
      await provider.execute({
        amountIn: 100,
        assetIn: MockUSDC, // 6 decimals
        assetOut: MockWETH,
        chainId: 84532 as SupportedChainId,
        walletAddress: '0x1234' as Address,
      })

      expect(provider.mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          amountInRaw: 100000000n, // 100 * 10^6
        }),
      )
    })

    it('should return swap transaction', async () => {
      const provider = new MockSwapProvider()
      const result = await provider.execute({
        amountIn: 100,
        assetIn: MockUSDC,
        assetOut: MockWETH,
        chainId: 84532 as SupportedChainId,
        walletAddress: '0x1234' as Address,
      })

      expect(result.amountIn).toBeDefined()
      expect(result.amountOut).toBeDefined()
      expect(result.transactionData.swap).toBeDefined()
    })
  })

  describe('getQuote()', () => {
    it('should throw if chain not supported', async () => {
      const provider = new MockSwapProvider()
      await expect(
        provider.getQuote({
          assetIn: MockUSDC,
          assetOut: MockWETH,
          chainId: 999 as SupportedChainId,
        }),
      ).rejects.toThrow('Chain 999 is not supported')
    })

    it('should return quote', async () => {
      const provider = new MockSwapProvider()
      const quote = await provider.getQuote({
        assetIn: MockUSDC,
        assetOut: MockWETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
      })

      expect(quote.price).toBeDefined()
      expect(quote.amountIn).toBeDefined()
      expect(quote.amountOut).toBeDefined()
      expect(quote.route).toBeDefined()
    })
  })

  describe('getMarket()', () => {
    it('should throw if chain not supported', async () => {
      const provider = new MockSwapProvider()
      await expect(
        provider.getMarket({
          poolId: '0xpool1',
          chainId: 999 as SupportedChainId,
        }),
      ).rejects.toThrow('Chain 999 is not supported')
    })

    it('should return market info', async () => {
      const provider = new MockSwapProvider()
      const market = await provider.getMarket({
        poolId: '0xpool1',
        chainId: 84532 as SupportedChainId,
      })

      expect(market.marketId.poolId).toBe('0xpool1')
      expect(market.assets).toHaveLength(2)
      expect(market.provider).toBe('uniswap')
    })
  })

  describe('getMarkets()', () => {
    it('should return markets array', async () => {
      const provider = new MockSwapProvider()
      const markets = await provider.getMarkets()

      expect(Array.isArray(markets)).toBe(true)
      expect(markets.length).toBeGreaterThan(0)
    })

    it('should validate chainId if provided', async () => {
      const provider = new MockSwapProvider()
      await expect(
        provider.getMarkets({ chainId: 999 as SupportedChainId }),
      ).rejects.toThrow('Chain 999 is not supported')
    })
  })

  describe('supportedChainIds()', () => {
    it('should return array of supported chain IDs', () => {
      const provider = new MockSwapProvider()
      const chainIds = provider.supportedChainIds()

      expect(Array.isArray(chainIds)).toBe(true)
      expect(chainIds).toContain(84532)
    })
  })

  describe('isChainSupported()', () => {
    it('should return true for supported chain', () => {
      const provider = new MockSwapProvider()
      expect(provider.isChainSupported(84532 as SupportedChainId)).toBe(true)
    })

    it('should return false for unsupported chain', () => {
      const provider = new MockSwapProvider()
      expect(provider.isChainSupported(999 as SupportedChainId)).toBe(false)
    })
  })

  describe('validateMarketAllowed()', () => {
    it('should allow any pair when no allowlist configured', () => {
      const provider = new MockSwapProvider()
      expect(() =>
        provider.testValidateMarketAllowed(
          MockUSDC,
          MockWETH,
          84532 as SupportedChainId,
        ),
      ).not.toThrow()
    })

    it('should allow pairs in allowlist', () => {
      const config: SwapMarketConfig = {
        assets: [MockUSDC, MockWETH],
        chainId: 84532 as SupportedChainId,
      }
      const provider = new MockSwapProvider({ marketAllowlist: [config] })
      expect(() =>
        provider.testValidateMarketAllowed(
          MockUSDC,
          MockWETH,
          84532 as SupportedChainId,
        ),
      ).not.toThrow()
    })

    it('should reject pairs not in allowlist', () => {
      const config: SwapMarketConfig = {
        assets: [MockUSDC, MockWETH],
        chainId: 84532 as SupportedChainId,
      }
      const provider = new MockSwapProvider({ marketAllowlist: [config] })
      expect(() =>
        provider.testValidateMarketAllowed(
          MockUSDC,
          MockOP,
          84532 as SupportedChainId,
        ),
      ).toThrow('not in the allowlist')
    })

    it('should match pairs regardless of order', () => {
      const config: SwapMarketConfig = {
        assets: [MockUSDC, MockWETH],
        chainId: 84532 as SupportedChainId,
      }
      const provider = new MockSwapProvider({ marketAllowlist: [config] })
      // Reversed order should still match
      expect(() =>
        provider.testValidateMarketAllowed(
          MockWETH,
          MockUSDC,
          84532 as SupportedChainId,
        ),
      ).not.toThrow()
    })

    it('should reject blocklisted pairs', () => {
      const config: SwapMarketConfig = {
        assets: [MockUSDC, MockOP],
        chainId: 84532 as SupportedChainId,
      }
      const provider = new MockSwapProvider({ marketBlocklist: [config] })
      expect(() =>
        provider.testValidateMarketAllowed(
          MockUSDC,
          MockOP,
          84532 as SupportedChainId,
        ),
      ).toThrow('is blocked')
    })

    it('should check blocklist before allowlist', () => {
      const allowConfig: SwapMarketConfig = {
        assets: [MockUSDC, MockWETH],
        chainId: 84532 as SupportedChainId,
      }
      const blockConfig: SwapMarketConfig = {
        assets: [MockUSDC, MockWETH],
        chainId: 84532 as SupportedChainId,
      }
      const provider = new MockSwapProvider({
        marketAllowlist: [allowConfig],
        marketBlocklist: [blockConfig],
      })
      // Blocklist takes precedence
      expect(() =>
        provider.testValidateMarketAllowed(
          MockUSDC,
          MockWETH,
          84532 as SupportedChainId,
        ),
      ).toThrow('is blocked')
    })

    it('should expand multi-asset filter to all pairs', () => {
      const config: SwapMarketConfig = {
        assets: [MockUSDC, MockWETH, MockOP],
        chainId: 84532 as SupportedChainId,
      }
      const provider = new MockSwapProvider({ marketAllowlist: [config] })

      // All 3 pairs should be allowed: USDC/WETH, USDC/OP, WETH/OP
      expect(() =>
        provider.testValidateMarketAllowed(
          MockUSDC,
          MockWETH,
          84532 as SupportedChainId,
        ),
      ).not.toThrow()
      expect(() =>
        provider.testValidateMarketAllowed(
          MockUSDC,
          MockOP,
          84532 as SupportedChainId,
        ),
      ).not.toThrow()
      expect(() =>
        provider.testValidateMarketAllowed(
          MockWETH,
          MockOP,
          84532 as SupportedChainId,
        ),
      ).not.toThrow()
    })

    it('should match any chain when filter has no chainId', () => {
      // Assets with addresses on both chains
      const multiChainUSDC: Asset = {
        ...MockUSDC,
        address: {
          84532: '0x1111111111111111111111111111111111111111' as Address,
          10: '0x1111111111111111111111111111111111111112' as Address,
        },
      }
      const multiChainWETH: Asset = {
        ...MockWETH,
        address: {
          84532: '0x2222222222222222222222222222222222222222' as Address,
          10: '0x2222222222222222222222222222222222222223' as Address,
        },
      }
      const config: SwapMarketConfig = {
        assets: [multiChainUSDC, multiChainWETH],
      }
      const provider = new MockSwapProvider(
        { marketAllowlist: [config] },
        {
          supportedChains: [84532 as SupportedChainId, 10 as SupportedChainId],
        },
      )

      // Should match on any supported chain
      expect(() =>
        provider.testValidateMarketAllowed(
          multiChainUSDC,
          multiChainWETH,
          84532 as SupportedChainId,
        ),
      ).not.toThrow()
      expect(() =>
        provider.testValidateMarketAllowed(
          multiChainUSDC,
          multiChainWETH,
          10 as SupportedChainId,
        ),
      ).not.toThrow()
    })

    it('should scope filter to specific chainId when provided', () => {
      const multiChainUSDC: Asset = {
        ...MockUSDC,
        address: {
          84532: '0x1111111111111111111111111111111111111111' as Address,
          10: '0x1111111111111111111111111111111111111112' as Address,
        },
      }
      const multiChainWETH: Asset = {
        ...MockWETH,
        address: {
          84532: '0x2222222222222222222222222222222222222222' as Address,
          10: '0x2222222222222222222222222222222222222223' as Address,
        },
      }
      const config: SwapMarketConfig = {
        assets: [multiChainUSDC, multiChainWETH],
        chainId: 84532 as SupportedChainId,
      }
      const provider = new MockSwapProvider(
        { marketAllowlist: [config] },
        {
          supportedChains: [84532 as SupportedChainId, 10 as SupportedChainId],
        },
      )

      // Should match on 84532
      expect(() =>
        provider.testValidateMarketAllowed(
          multiChainUSDC,
          multiChainWETH,
          84532 as SupportedChainId,
        ),
      ).not.toThrow()

      // Should NOT match on chain 10
      expect(() =>
        provider.testValidateMarketAllowed(
          multiChainUSDC,
          multiChainWETH,
          10 as SupportedChainId,
        ),
      ).toThrow('not in the allowlist')
    })
  })
})
