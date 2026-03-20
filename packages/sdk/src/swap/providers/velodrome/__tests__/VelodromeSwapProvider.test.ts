import type { Address, PublicClient } from 'viem'
import { optimism } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'

import type { VelodromeSwapProviderConfig } from '../types.js'
import { VelodromeSwapProvider } from '../VelodromeSwapProvider.js'

const CHAIN_ID = optimism.id as SupportedChainId

const USDC: Asset = {
  type: 'erc20',
  address: {
    [CHAIN_ID]: '0x1111111111111111111111111111111111111111' as Address,
  },
  metadata: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
}

const OP: Asset = {
  type: 'erc20',
  address: {
    [CHAIN_ID]: '0x3333333333333333333333333333333333333333' as Address,
  },
  metadata: { name: 'Optimism', symbol: 'OP', decimals: 18 },
}

const WETH: Asset = {
  type: 'erc20',
  address: {
    [CHAIN_ID]: '0x4200000000000000000000000000000000000006' as Address,
  },
  metadata: { name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
}

function createMockChainManager(): ChainManager {
  const mockPublicClient = {
    readContract: vi
      .fn()
      .mockImplementation(({ functionName }: { functionName: string }) => {
        // getAmountsOut returns [amountIn, amountOut]
        if (functionName === 'getAmountsOut')
          return Promise.resolve([100000000n, 500000000000000000n])
        // ERC20 allowance
        if (functionName === 'allowance') return Promise.resolve(0n)
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
      const chainIds = provider.supportedChainIds()
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
        walletAddress: '0x000000000000000000000000000000000000dEaD' as Address,
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
        walletAddress: '0x000000000000000000000000000000000000dEaD' as Address,
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
          walletAddress:
            '0x000000000000000000000000000000000000dEaD' as Address,
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
          walletAddress:
            '0x000000000000000000000000000000000000dEaD' as Address,
        }),
      ).rejects.toThrow('stable flag must be configured')
    })
  })

  describe('getPrice', () => {
    it('returns price quote', async () => {
      const provider = createProvider()
      const price = await provider.getPrice({
        assetIn: USDC,
        assetOut: OP,
        amountIn: 100,
        chainId: CHAIN_ID,
      })

      expect(price.price).toBeDefined()
      expect(price.amountIn).toBeDefined()
      expect(price.amountOut).toBeDefined()
      expect(price.route.path).toEqual([USDC, OP])
    })

    it('defaults to 1 unit when no amount specified', async () => {
      const provider = createProvider()
      const price = await provider.getPrice({
        assetIn: USDC,
        assetOut: OP,
        chainId: CHAIN_ID,
      })

      // 1 USDC = 1000000 (6 decimals)
      expect(price.amountInWei).toBe(1000000n)
    })

    it('throws for exact-output quotes', async () => {
      const provider = createProvider()

      await expect(
        provider.getPrice({
          assetIn: USDC,
          assetOut: OP,
          amountOut: 1,
          chainId: CHAIN_ID,
        }),
      ).rejects.toThrow('does not support exact-output swaps')
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

      expect(quote.price).toBeDefined()
      expect(quote.price.price).toBeDefined()
      expect(quote.execution).toBeDefined()
      expect(quote.execution.swapCalldata).toMatch(/^0x/)
      expect(quote.execution.routerAddress).toBeDefined()
      expect(quote.execution.amountInWei).toBeGreaterThan(0n)
      expect(quote.provider).toBe('velodrome')
      expect(quote.quotedAt).toBeGreaterThan(0)
      expect(quote.expiresAt).toBeGreaterThan(quote.quotedAt)
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
        recipient: '0x000000000000000000000000000000000000dEaD' as Address,
      })

      const result = await provider.execute(quote)

      expect(result.transactionData.swap).toBeDefined()
      expect(result.transactionData.swap.data).toBe(
        quote.execution.swapCalldata,
      )
      expect(result.price).toBe(quote.price.price)
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

    it('skips configs without stable defined', async () => {
      const provider = createProvider({
        marketAllowlist: [
          // Intentionally omit stable to test filtering
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
})
