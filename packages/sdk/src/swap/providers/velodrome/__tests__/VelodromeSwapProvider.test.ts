import type { Address, PublicClient } from 'viem'
import { mode, optimism } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import {
  MOCK_WALLET,
  MockOPAsset as OP,
  MockUSDCAsset as USDC,
  MockWETHAsset as WETH,
} from '@/__mocks__/MockAssets.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { VelodromeSwapProviderConfig } from '@/swap/providers/velodrome/types.js'
import { VelodromeSwapProvider } from '@/swap/providers/velodrome/VelodromeSwapProvider.js'
import type { Asset } from '@/types/asset.js'

const CHAIN_ID = optimism.id as SupportedChainId

function createMockChainManager(): ChainManager {
  const mockPublicClient = {
    readContract: vi
      .fn()
      .mockImplementation(({ functionName }: { functionName: string }) => {
        if (functionName === 'getAmountsOut')
          return Promise.resolve([100000000n, 500000000000000000n])
        if (functionName === 'allowance') return Promise.resolve(0n)
        if (functionName === 'getPool')
          return Promise.resolve('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
        if (functionName === 'quoteExactInputSingle')
          return Promise.resolve([500000000000000000n, 0n, 0, 0n])
        return Promise.resolve(0n)
      }),
  } as unknown as PublicClient

  return {
    getPublicClient: vi.fn().mockReturnValue(mockPublicClient),
    getSupportedChains: vi.fn().mockReturnValue([CHAIN_ID]),
  } as unknown as ChainManager
}

function createProvider(
  configOverrides?: Partial<VelodromeSwapProviderConfig>,
): VelodromeSwapProvider {
  const config: VelodromeSwapProviderConfig = {
    defaultSlippage: 0.005,
    marketAllowlist: [{ assets: [USDC, OP], stable: false, chainId: CHAIN_ID }],
    ...configOverrides,
  }
  return new VelodromeSwapProvider(config, createMockChainManager())
}

describe('VelodromeSwapProvider', () => {
  describe('supportedChainIds', () => {
    it('returns Optimism and Base', () => {
      const provider = createProvider()
      const chainIds = provider.protocolSupportedChainIds()
      expect(chainIds).toContain(10) // Optimism
      expect(chainIds).toContain(8453) // Base
    })
  })

  describe('execute', () => {
    it('returns swap transaction with approval data', async () => {
      const provider = createProvider()
      const result = await provider.execute({
        amountIn: 100,
        assetIn: USDC,
        assetOut: OP,
        chainId: CHAIN_ID,
        walletAddress: MOCK_WALLET,
      })

      expect(result.transactionData.swap).toBeDefined()
      expect(result.transactionData.swap.to).toBeDefined()
      expect(result.transactionData.swap.data).toMatch(/^0x/)
      expect(result.amountIn).toBeDefined()
      expect(result.amountOut).toBeDefined()
      expect(result.price).toBeDefined()
    })

    it('includes token approval to router when allowance insufficient', async () => {
      const provider = createProvider()
      const result = await provider.execute({
        amountIn: 100,
        assetIn: USDC,
        assetOut: OP,
        chainId: CHAIN_ID,
        walletAddress: MOCK_WALLET,
      })

      // Mock returns 0n allowance, so approval to Router should be needed
      expect(result.transactionData.tokenApproval).toBeDefined()
      // No Permit2 for Velodrome
      expect(result.transactionData.permit2Approval).toBeUndefined()
    })

    it('throws for exact-output swaps', async () => {
      const provider = createProvider()

      await expect(
        provider.execute({
          amountOut: 1,
          assetIn: USDC,
          assetOut: OP,
          chainId: CHAIN_ID,
          walletAddress: MOCK_WALLET,
        }),
      ).rejects.toThrow('does not support exact-output swaps')
    })

    it('throws without stable flag in market config', async () => {
      const provider = createProvider({
        // Intentionally omit stable to test runtime validation
        marketAllowlist: [{ assets: [USDC, OP], chainId: CHAIN_ID }],
      })

      await expect(
        provider.execute({
          amountIn: 100,
          assetIn: USDC,
          assetOut: OP,
          chainId: CHAIN_ID,
          walletAddress: MOCK_WALLET,
        }),
      ).rejects.toThrow(
        'Either stable (v2 AMM) or tickSpacing (CL) must be configured',
      )
    })
  })

  describe('getQuote', () => {
    it('returns SwapQuote with execution data', async () => {
      const provider = createProvider()
      const quote = await provider.getQuote({
        assetIn: USDC,
        assetOut: OP,
        amountIn: 100,
        chainId: CHAIN_ID,
      })

      expect(quote.price).toBeTypeOf('number')
      expect(quote.amountIn).toBeDefined()
      expect(quote.amountOut).toBeDefined()
      expect(quote.amountInRaw).toBeGreaterThan(0n)
      expect(quote.route.path).toEqual([USDC, OP])
      expect(quote.execution).toBeDefined()
      expect(quote.execution!.swapCalldata).toMatch(/^0x/)
      expect(quote.execution!.routerAddress).toBeDefined()
      expect(quote.provider).toBe('velodrome')
      expect(quote.quotedAt).toBeGreaterThan(0)
      expect(quote.expiresAt).toBeGreaterThan(quote.quotedAt)
    })

    it('defaults to 1 unit when no amount specified', async () => {
      const provider = createProvider()
      const quote = await provider.getQuote({
        assetIn: USDC,
        assetOut: OP,
        chainId: CHAIN_ID,
      })

      // 1 USDC = 1000000 (6 decimals)
      expect(quote.amountInRaw).toBe(1000000n)
    })

    it('throws for exact-output quotes', async () => {
      const provider = createProvider()

      await expect(
        provider.getQuote({
          assetIn: USDC,
          assetOut: OP,
          amountOut: 1,
          chainId: CHAIN_ID,
        }),
      ).rejects.toThrow('does not support exact-output swaps')
    })

    it('execute with quote skips re-quoting', async () => {
      const provider = createProvider()
      const quote = await provider.getQuote({
        assetIn: USDC,
        assetOut: OP,
        amountIn: 100,
        chainId: CHAIN_ID,
        recipient: MOCK_WALLET,
      })

      const result = await provider.execute({
        ...quote,
        recipient: MOCK_WALLET,
      })

      expect(result.transactionData.swap).toBeDefined()
      expect(result.transactionData.swap.data).toBe(
        quote.execution!.swapCalldata,
      )
      expect(result.price).toBe(quote.price)
    })
  })

  describe('getMarkets', () => {
    it('returns markets from allowlist config', async () => {
      const provider = createProvider()
      const markets = await provider.getMarkets({})
      expect(markets).toHaveLength(1)
      expect(markets[0].assets).toEqual([USDC, OP])
      expect(markets[0].fee).toBe(0)
      expect(markets[0].provider).toBe('velodrome')
      expect(markets[0].marketId.poolId).toMatch(/^0x/)
      expect(markets[0].marketId.chainId).toBe(CHAIN_ID)
    })

    it('returns empty when no allowlist configured', async () => {
      const provider = createProvider({ marketAllowlist: [] })
      const markets = await provider.getMarkets({})
      expect(markets).toEqual([])
    })

    it('expands multi-asset filter into all pairs', async () => {
      const provider = createProvider({
        marketAllowlist: [
          {
            assets: [USDC, OP, WETH],
            stable: false,
            chainId: CHAIN_ID,
          },
        ],
      })
      const markets = await provider.getMarkets({})
      // 3 assets → 3 pairs: USDC/OP, USDC/WETH, OP/WETH
      expect(markets).toHaveLength(3)
    })

    it('filters by asset', async () => {
      const provider = createProvider({
        marketAllowlist: [
          {
            assets: [USDC, OP, WETH],
            stable: false,
            chainId: CHAIN_ID,
          },
        ],
      })
      const markets = await provider.getMarkets({ asset: USDC })
      expect(markets).toHaveLength(2)
      for (const market of markets) {
        expect(market.assets).toContain(USDC)
      }
    })

    it('skips configs without stable or tickSpacing defined', async () => {
      const provider = createProvider({
        marketAllowlist: [
          // Intentionally omit both to test filtering
          { assets: [USDC, OP], chainId: CHAIN_ID },
          {
            assets: [USDC, WETH],
            stable: true,
            chainId: CHAIN_ID,
          },
        ],
      })
      const markets = await provider.getMarkets({})
      expect(markets).toHaveLength(1)
      expect(markets[0].assets).toEqual([USDC, WETH])
    })

    it('includes CL configs with tickSpacing', async () => {
      const provider = createProvider({
        marketAllowlist: [
          {
            assets: [USDC, WETH],
            tickSpacing: 100,
            chainId: CHAIN_ID,
          },
        ],
      })
      const markets = await provider.getMarkets({})
      expect(markets).toHaveLength(1)
      expect(markets[0].marketId.poolId).toMatch(/^0x/)
    })

    it('CL pool has different poolId than v2 pool for same pair', async () => {
      const v2Provider = createProvider({
        marketAllowlist: [
          { assets: [USDC, WETH], stable: false, chainId: CHAIN_ID },
        ],
      })
      const clProvider = createProvider({
        marketAllowlist: [
          { assets: [USDC, WETH], tickSpacing: 100, chainId: CHAIN_ID },
        ],
      })
      const v2Markets = await v2Provider.getMarkets({})
      const clMarkets = await clProvider.getMarkets({})
      expect(v2Markets[0].marketId.poolId).not.toBe(
        clMarkets[0].marketId.poolId,
      )
    })

    it('throws when both stable and tickSpacing are set', async () => {
      const provider = createProvider({
        marketAllowlist: [
          {
            assets: [USDC, OP],
            stable: false,
            tickSpacing: 100,
            chainId: CHAIN_ID,
          },
        ],
      })
      await expect(provider.getMarkets({})).rejects.toThrow(
        'mutually exclusive',
      )
    })

    it('skips assets without address on target chain', async () => {
      const noChainAsset: Asset = {
        type: 'erc20',
        address: { 1: '0x5555555555555555555555555555555555555555' as Address },
        metadata: { name: 'No Chain', symbol: 'NC', decimals: 18 },
      }
      const provider = createProvider({
        marketAllowlist: [
          { assets: [USDC, noChainAsset], stable: false, chainId: CHAIN_ID },
        ],
      })
      const markets = await provider.getMarkets({})
      expect(markets).toEqual([])
    })

    it('produces deterministic poolIds', async () => {
      const provider = createProvider()
      const first = await provider.getMarkets({})
      const second = await provider.getMarkets({})
      expect(first[0].marketId.poolId).toBe(second[0].marketId.poolId)
    })
  })

  describe('getMarket', () => {
    it('finds market by poolId', async () => {
      const provider = createProvider()
      const markets = await provider.getMarkets({})
      const market = await provider.getMarket({
        poolId: markets[0].marketId.poolId,
        chainId: CHAIN_ID,
      })
      expect(market.fee).toBe(0)
      expect(market.assets).toEqual([USDC, OP])
    })

    it('throws for unknown poolId', async () => {
      const provider = createProvider()
      await expect(
        provider.getMarket({ poolId: '0xunknown', chainId: CHAIN_ID }),
      ).rejects.toThrow('not found')
    })

    it('finds correct market in multi-asset filter', async () => {
      const provider = createProvider({
        marketAllowlist: [
          {
            assets: [USDC, OP, WETH],
            stable: false,
            chainId: CHAIN_ID,
          },
        ],
      })
      const markets = await provider.getMarkets({})
      for (const expected of markets) {
        const found = await provider.getMarket({
          poolId: expected.marketId.poolId,
          chainId: CHAIN_ID,
        })
        expect(found.marketId.poolId).toBe(expected.marketId.poolId)
      }
    })
  })

  describe('CL/Slipstream pools', () => {
    it('getQuote returns quote with CL-specific providerContext', async () => {
      const provider = createProvider({
        marketAllowlist: [
          { assets: [USDC, WETH], tickSpacing: 100, chainId: CHAIN_ID },
        ],
      })

      const quote = await provider.getQuote({
        assetIn: USDC,
        assetOut: WETH,
        amountIn: 100,
        chainId: CHAIN_ID,
      })

      expect(quote.provider).toBe('velodrome')
      expect(quote.amountOut).toBeGreaterThan(0)
      expect(quote.execution!.swapCalldata).toMatch(/^0x/)
      expect(
        (quote.execution!.providerContext as Record<string, unknown>)
          .tickSpacing,
      ).toBe(100)
    })

    it('execute with CL quote uses pre-built calldata', async () => {
      const provider = createProvider({
        marketAllowlist: [
          { assets: [USDC, WETH], tickSpacing: 100, chainId: CHAIN_ID },
        ],
      })

      const quote = await provider.getQuote({
        assetIn: USDC,
        assetOut: WETH,
        amountIn: 100,
        chainId: CHAIN_ID,
        recipient: MOCK_WALLET,
      })

      const result = await provider.execute({
        ...quote,
        recipient: MOCK_WALLET,
      })
      expect(result.transactionData.swap.data).toBe(
        quote.execution!.swapCalldata,
      )
    })

    it('execute works for CL pool via raw params', async () => {
      const provider = createProvider({
        marketAllowlist: [
          { assets: [USDC, WETH], tickSpacing: 100, chainId: CHAIN_ID },
        ],
      })

      const result = await provider.execute({
        amountIn: 100,
        assetIn: USDC,
        assetOut: WETH,
        chainId: CHAIN_ID,
        walletAddress: MOCK_WALLET,
      })

      expect(result.transactionData.swap).toBeDefined()
      expect(result.amountOut).toBeGreaterThan(0)
    })

    it('throws for CL on unsupported chain (no clPoolFactory)', async () => {
      const MODE_CHAIN_ID = mode.id as SupportedChainId

      const mockChainManager = {
        getPublicClient: vi.fn().mockReturnValue({
          readContract: vi.fn(),
        }),
        getSupportedChains: vi.fn().mockReturnValue([MODE_CHAIN_ID]),
      } as unknown as ChainManager

      const provider = new VelodromeSwapProvider(
        {
          defaultSlippage: 0.005,
          marketAllowlist: [
            {
              assets: [USDC, WETH],
              tickSpacing: 100,
              chainId: MODE_CHAIN_ID,
            },
          ],
        },
        mockChainManager,
      )

      await expect(
        provider.getQuote({
          assetIn: USDC,
          assetOut: WETH,
          amountIn: 100,
          chainId: MODE_CHAIN_ID,
        }),
      ).rejects.toThrow('CL pools not supported on chain')
    })
  })

  describe('protocolSupportedChainIds', () => {
    it('includes all configured chains', () => {
      const provider = createProvider()
      const chainIds = provider.protocolSupportedChainIds()

      expect(chainIds).toContain(10) // Optimism
      expect(chainIds).toContain(8453) // Base
      expect(chainIds).toContain(84532) // Base Sepolia
      expect(chainIds).toContain(60808) // Bob
      expect(chainIds).toContain(42220) // Celo
      expect(chainIds).toContain(252) // Fraxtal
      expect(chainIds).toContain(57073) // Ink
      expect(chainIds).toContain(1135) // Lisk
      expect(chainIds).toContain(1750) // Metal
      expect(chainIds).toContain(34443) // Mode
      expect(chainIds).toContain(1868) // Soneium
      expect(chainIds).toContain(5330) // Superseed
      expect(chainIds).toContain(1923) // Swell
      expect(chainIds).toContain(130) // Unichain

      expect(chainIds).toHaveLength(14)
    })
  })
})
