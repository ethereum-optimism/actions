import {
  type Address,
  decodeAbiParameters,
  decodeFunctionData,
  type PublicClient,
} from 'viem'
import { baseSepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import { MockWETHAsset } from '@/__mocks__/MockAssets.js'
import {
  EXACT_INPUT_PARAMS,
  UNIVERSAL_ROUTER_ABI,
} from '@/actions/swap/providers/uniswap/abis.js'
import type { UniswapSwapProviderConfig } from '@/actions/swap/providers/uniswap/types.js'
import { UniswapSwapProvider } from '@/actions/swap/providers/uniswap/UniswapSwapProvider.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'

const CHAIN_ID = baseSepolia.id as SupportedChainId

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

function createMockChainManager(): ChainManager {
  const mockPublicClient = {
    simulateContract: vi.fn().mockResolvedValue({
      result: [500000000000000000n, 150000n],
    }),
    readContract: vi
      .fn()
      .mockImplementation(
        ({ functionName, args }: { functionName: string; args: unknown[] }) => {
          if (functionName === 'extsload')
            return Promise.resolve(
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            )
          // Permit2 allowance: 3 args (owner, token, spender)
          if (args?.length === 3) return Promise.resolve([0n, 0, 0])
          // ERC20 allowance: 2 args (owner, spender)
          return Promise.resolve(0n)
        },
      ),
  } as unknown as PublicClient

  return {
    getPublicClient: vi.fn().mockReturnValue(mockPublicClient),
    getSupportedChains: vi.fn().mockReturnValue([CHAIN_ID]),
  } as unknown as ChainManager
}

function createProvider(
  configOverrides?: Partial<UniswapSwapProviderConfig>,
): UniswapSwapProvider {
  const config: UniswapSwapProviderConfig = {
    defaultSlippage: 0.005,
    marketAllowlist: [
      { assets: [USDC, OP], fee: 100, tickSpacing: 2, chainId: CHAIN_ID },
    ],
    ...configOverrides,
  }
  return new UniswapSwapProvider(config, createMockChainManager())
}

describe('UniswapSwapProvider', () => {
  describe('supportedChainIds', () => {
    it('returns Base Sepolia', () => {
      const provider = createProvider()
      expect(provider.supportedChainIds()).toContain(CHAIN_ID)
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
        walletAddress: '0x4444444444444444444444444444444444444444' as Address,
      })

      expect(result.transactionData.swap).toBeDefined()
      expect(result.transactionData.swap.to).toBeDefined()
      expect(result.transactionData.swap.data).toMatch(/^0x/)
      expect(result.amountIn).toBeDefined()
      expect(result.amountOut).toBeDefined()
      expect(result.price).toBeDefined()
    })

    it('includes token approval when allowance is insufficient', async () => {
      const provider = createProvider()
      const result = await provider.execute({
        amountIn: 100,
        assetIn: USDC,
        assetOut: OP,
        chainId: CHAIN_ID,
        walletAddress: '0x4444444444444444444444444444444444444444' as Address,
      })

      // Mock readContract returns 0n (no allowance), so approvals should be needed
      expect(result.transactionData.tokenApproval).toBeDefined()
      expect(result.transactionData.permit2Approval).toBeDefined()
    })

    it('throws without fee/tickSpacing or a path in market filter', async () => {
      const provider = createProvider({
        marketAllowlist: [{ assets: [USDC, OP], chainId: CHAIN_ID }],
      })

      await expect(
        provider.execute({
          amountIn: 100,
          assetIn: USDC,
          assetOut: OP,
          chainId: CHAIN_ID,
          walletAddress:
            '0x4444444444444444444444444444444444444444' as Address,
        }),
      ).rejects.toThrow('fee and tickSpacing (or a multi-hop path)')
    })
  })

  describe('getQuote', () => {
    it('returns swap quote', async () => {
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
      expect(quote.route.path).toEqual([USDC, OP])
      expect(quote.execution).toBeDefined()
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

    it('routes a path-configured pair through multi-hop end-to-end', async () => {
      const provider = createProvider({
        marketAllowlist: [
          {
            assets: [USDC, OP],
            chainId: CHAIN_ID,
            path: [
              { asset: MockWETHAsset, fee: 500, tickSpacing: 10 },
              { asset: OP, fee: 3000, tickSpacing: 60 },
            ],
          },
        ],
      })

      const quote = await provider.getQuote({
        assetIn: USDC,
        assetOut: OP,
        amountIn: 100,
        chainId: CHAIN_ID,
      })

      // Route reflects the configured intermediate, not a direct pool.
      expect(quote.route.path).toEqual([USDC, MockWETHAsset, OP])
      expect(quote.route.pools).toHaveLength(2)

      // Decoded calldata uses the multi-hop SWAP_EXACT_IN action (0x07).
      const { args } = decodeFunctionData({
        abi: UNIVERSAL_ROUTER_ABI,
        data: quote.execution.swapCalldata,
      })
      const [, inputs] = args as readonly [
        `0x${string}`,
        ReadonlyArray<`0x${string}`>,
        bigint,
      ]
      const [actions, actionParams] = decodeAbiParameters(
        [{ type: 'bytes' }, { type: 'bytes[]' }],
        inputs[0]!,
      )
      expect(actions).toBe('0x070c0f')

      const [decoded] = decodeAbiParameters(
        EXACT_INPUT_PARAMS,
        (actionParams as ReadonlyArray<`0x${string}`>)[0]!,
      )
      const p = decoded as {
        currencyIn: string
        path: ReadonlyArray<{ intermediateCurrency: string }>
      }
      expect(p.currencyIn.toLowerCase()).toBe(
        (USDC.address[CHAIN_ID] as string).toLowerCase(),
      )
      expect(p.path).toHaveLength(2)
    })
  })

  describe('getMarkets', () => {
    it('returns markets from allowlist config', async () => {
      const provider = createProvider()
      const markets = await provider.getMarkets({})
      expect(markets).toHaveLength(1)
      expect(markets[0].assets).toEqual([USDC, OP])
      expect(markets[0].fee).toBe(100)
      expect(markets[0].provider).toBe('uniswap')
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
            assets: [USDC, OP, MockWETHAsset],
            fee: 100,
            tickSpacing: 2,
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
            assets: [USDC, OP, MockWETHAsset],
            fee: 100,
            tickSpacing: 2,
            chainId: CHAIN_ID,
          },
        ],
      })
      const markets = await provider.getMarkets({ asset: USDC })
      // Only pairs containing USDC: USDC/OP, USDC/WETH
      expect(markets).toHaveLength(2)
      for (const market of markets) {
        expect(market.assets).toContain(USDC)
      }
    })

    it('skips filters without fee/tickSpacing', async () => {
      const provider = createProvider({
        marketAllowlist: [
          { assets: [USDC, OP], chainId: CHAIN_ID },
          {
            assets: [USDC, MockWETHAsset],
            fee: 500,
            tickSpacing: 10,
            chainId: CHAIN_ID,
          },
        ],
      })
      const markets = await provider.getMarkets({})
      // Only the second filter has fee+tickSpacing
      expect(markets).toHaveLength(1)
      expect(markets[0].assets).toEqual([USDC, MockWETHAsset])
    })

    it('skips assets without address on target chain', async () => {
      const noChainAsset: Asset = {
        type: 'erc20',
        address: { 1: '0x5555555555555555555555555555555555555555' as Address },
        metadata: { name: 'No Chain', symbol: 'NC', decimals: 18 },
      }
      const provider = createProvider({
        marketAllowlist: [
          {
            assets: [USDC, noChainAsset],
            fee: 100,
            tickSpacing: 2,
            chainId: CHAIN_ID,
          },
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
      expect(market.fee).toBe(100)
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
            assets: [USDC, OP, MockWETHAsset],
            fee: 100,
            tickSpacing: 2,
            chainId: CHAIN_ID,
          },
        ],
      })
      const markets = await provider.getMarkets({})
      // Look up each market by its poolId
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
