import type { Address, PublicClient } from 'viem'
import { base, baseSepolia, optimism } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'

import type { VelodromeSwapProviderConfig } from '@/swap/providers/velodrome/types.js'
import { VelodromeSwapProvider } from '@/swap/providers/velodrome/VelodromeSwapProvider.js'

const OP_CHAIN_ID = optimism.id as SupportedChainId
const BASE_CHAIN_ID = base.id as SupportedChainId
const BASE_SEPOLIA_CHAIN_ID = baseSepolia.id as SupportedChainId

const WALLET = '0x000000000000000000000000000000000000dEaD' as Address
const MOCK_POOL = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address

const USDC: Asset = {
  type: 'erc20',
  address: {
    [OP_CHAIN_ID]: '0x1111111111111111111111111111111111111111' as Address,
    [BASE_CHAIN_ID]: '0x2222222222222222222222222222222222222222' as Address,
    [BASE_SEPOLIA_CHAIN_ID]:
      '0x3333333333333333333333333333333333333333' as Address,
  },
  metadata: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
}

const WETH: Asset = {
  type: 'erc20',
  address: {
    [OP_CHAIN_ID]: '0x4200000000000000000000000000000000000006' as Address,
    [BASE_CHAIN_ID]: '0x4200000000000000000000000000000000000006' as Address,
    [BASE_SEPOLIA_CHAIN_ID]:
      '0x4200000000000000000000000000000000000006' as Address,
  },
  metadata: { name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
}

const ETH: Asset = {
  type: 'native',
  address: {
    [OP_CHAIN_ID]: 'native',
    [BASE_CHAIN_ID]: 'native',
    [BASE_SEPOLIA_CHAIN_ID]: 'native',
  },
  metadata: { name: 'Ether', symbol: 'ETH', decimals: 18 },
}

function createMockChainManager(chainId: SupportedChainId): ChainManager {
  const mockPublicClient = {
    readContract: vi
      .fn()
      .mockImplementation(({ functionName }: { functionName: string }) => {
        if (functionName === 'getAmountsOut')
          return Promise.resolve([1000000n, 500000000000000000n])
        if (functionName === 'allowance') return Promise.resolve(0n)
        // Factory.getPool returns a pool address
        if (functionName === 'getPool') return Promise.resolve(MOCK_POOL)
        // Pool.getAmountOut for v2/universal quoting
        if (functionName === 'getAmountOut')
          return Promise.resolve(500000000000000000n)
        // QuoterV2.quoteExactInputSingle for CL pools
        if (functionName === 'quoteExactInputSingle')
          return Promise.resolve([500000000000000000n, 0n, 0, 0n])
        return Promise.resolve(0n)
      }),
  } as unknown as PublicClient

  return {
    getPublicClient: vi.fn().mockReturnValue(mockPublicClient),
    getSupportedChains: vi.fn().mockReturnValue([chainId]),
  } as unknown as ChainManager
}

function createProvider(
  chainId: SupportedChainId,
  configOverrides?: Partial<VelodromeSwapProviderConfig>,
): VelodromeSwapProvider {
  const config: VelodromeSwapProviderConfig = {
    defaultSlippage: 0.005,
    marketAllowlist: [{ assets: [USDC, WETH], stable: false, chainId }],
    ...configOverrides,
  }
  return new VelodromeSwapProvider(config, createMockChainManager(chainId))
}

describe('VelodromeSwapProvider router type routing', () => {
  describe('v2 router (Optimism)', () => {
    it('executes swap via legacy router on Optimism', async () => {
      const provider = createProvider(OP_CHAIN_ID)
      const result = await provider.execute({
        amountIn: 100,
        assetIn: USDC,
        assetOut: WETH,
        chainId: OP_CHAIN_ID,
        walletAddress: WALLET,
      })

      expect(result.transactionData.swap).toBeDefined()
      // Legacy router: approval via ERC20.approve (not transfer)
      expect(result.transactionData.tokenApproval).toBeDefined()
    })
  })

  describe('v2 router (Base / Aerodrome)', () => {
    it('executes swap via legacy router on Base', async () => {
      const provider = createProvider(BASE_CHAIN_ID)
      const result = await provider.execute({
        amountIn: 100,
        assetIn: USDC,
        assetOut: WETH,
        chainId: BASE_CHAIN_ID,
        walletAddress: WALLET,
      })

      expect(result.transactionData.swap).toBeDefined()
      expect(result.transactionData.tokenApproval).toBeDefined()
    })
  })

  describe('universal router (Base Sepolia)', () => {
    it('executes swap via Universal Router', async () => {
      const provider = createProvider(BASE_SEPOLIA_CHAIN_ID)
      const result = await provider.execute({
        amountIn: 100,
        assetIn: USDC,
        assetOut: WETH,
        chainId: BASE_SEPOLIA_CHAIN_ID,
        walletAddress: WALLET,
      })

      expect(result.transactionData.swap).toBeDefined()
      // Universal Router: uses ERC20.transfer (not approve)
      expect(result.transactionData.tokenApproval).toBeDefined()
      // tokenApproval should be a transfer() call, not approve()
      const approvalData = result.transactionData.tokenApproval!.data
      // transfer() selector = 0xa9059cbb
      expect(approvalData.startsWith('0xa9059cbb')).toBe(true)
    })

    it('quotes via pool.getAmountOut for Universal Router', async () => {
      const provider = createProvider(BASE_SEPOLIA_CHAIN_ID)
      const quote = await provider.getQuote({
        assetIn: USDC,
        assetOut: WETH,
        amountIn: 100,
        chainId: BASE_SEPOLIA_CHAIN_ID,
      })

      expect(quote.price).toBeTypeOf('number')
      expect(quote.amountOut).toBeGreaterThan(0)
    })
  })

  describe('leaf router (relay chains)', () => {
    it('executes swap on Mode (leaf chain)', async () => {
      const MODE_CHAIN_ID = 34443 as SupportedChainId
      const modeUsdc: Asset = {
        type: 'erc20',
        address: {
          [MODE_CHAIN_ID]:
            '0x5555555555555555555555555555555555555555' as Address,
        },
        metadata: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
      }
      const modeWeth: Asset = {
        type: 'erc20',
        address: {
          [MODE_CHAIN_ID]:
            '0x4200000000000000000000000000000000000006' as Address,
        },
        metadata: { name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
      }

      const provider = new VelodromeSwapProvider(
        {
          defaultSlippage: 0.005,
          marketAllowlist: [
            {
              assets: [modeUsdc, modeWeth],
              stable: false,
              chainId: MODE_CHAIN_ID,
            },
          ],
        },
        createMockChainManager(MODE_CHAIN_ID),
      )

      const result = await provider.execute({
        amountIn: 100,
        assetIn: modeUsdc,
        assetOut: modeWeth,
        chainId: MODE_CHAIN_ID,
        walletAddress: WALLET,
      })

      expect(result.transactionData.swap).toBeDefined()
      // Leaf router uses legacy approve pattern
      expect(result.transactionData.tokenApproval).toBeDefined()
    })
  })

  describe('native ETH swaps', () => {
    it('skips approval for native ETH input', async () => {
      const provider = createProvider(OP_CHAIN_ID, {
        marketAllowlist: [
          { assets: [ETH, USDC], stable: false, chainId: OP_CHAIN_ID },
        ],
      })

      const result = await provider.execute({
        amountIn: 1,
        assetIn: ETH,
        assetOut: USDC,
        chainId: OP_CHAIN_ID,
        walletAddress: WALLET,
      })

      // No approval needed for native ETH
      expect(result.transactionData.tokenApproval).toBeUndefined()
      // Swap tx should carry ETH value
      expect(result.transactionData.swap.value).toBeGreaterThan(0n)
    })

    it('includes zero value for token-to-native swaps', async () => {
      const provider = createProvider(OP_CHAIN_ID, {
        marketAllowlist: [
          { assets: [USDC, ETH], stable: false, chainId: OP_CHAIN_ID },
        ],
      })

      const result = await provider.execute({
        amountIn: 100,
        assetIn: USDC,
        assetOut: ETH,
        chainId: OP_CHAIN_ID,
        walletAddress: WALLET,
      })

      // Approval needed for USDC
      expect(result.transactionData.tokenApproval).toBeDefined()
      // Swap tx should have zero value (not sending ETH)
      expect(result.transactionData.swap.value).toBe(0n)
    })
  })

  describe('CL/Slipstream pools', () => {
    it('getQuote works for CL pool on Optimism', async () => {
      const provider = createProvider(OP_CHAIN_ID, {
        marketAllowlist: [
          { assets: [USDC, WETH], tickSpacing: 100, chainId: OP_CHAIN_ID },
        ],
      })

      const quote = await provider.getQuote({
        assetIn: USDC,
        assetOut: WETH,
        amountIn: 100,
        chainId: OP_CHAIN_ID,
      })

      expect(quote.provider).toBe('velodrome')
      expect(quote.amountOut).toBeGreaterThan(0)
      expect(quote.execution.swapCalldata).toMatch(/^0x/)
      expect(
        (quote.execution.providerContext as Record<string, unknown>)
          .tickSpacing,
      ).toBe(100)
    })

    it('getQuote works for CL pool on Base', async () => {
      const provider = createProvider(BASE_CHAIN_ID, {
        marketAllowlist: [
          { assets: [USDC, WETH], tickSpacing: 100, chainId: BASE_CHAIN_ID },
        ],
      })

      const quote = await provider.getQuote({
        assetIn: USDC,
        assetOut: WETH,
        amountIn: 100,
        chainId: BASE_CHAIN_ID,
      })

      expect(quote.provider).toBe('velodrome')
      expect(quote.execution).toBeDefined()
    })

    it('execute with CL quote uses pre-built calldata', async () => {
      const provider = createProvider(OP_CHAIN_ID, {
        marketAllowlist: [
          { assets: [USDC, WETH], tickSpacing: 100, chainId: OP_CHAIN_ID },
        ],
      })

      const quote = await provider.getQuote({
        assetIn: USDC,
        assetOut: WETH,
        amountIn: 100,
        chainId: OP_CHAIN_ID,
        recipient: WALLET,
      })

      const result = await provider.execute(quote)
      expect(result.transactionData.swap.data).toBe(
        quote.execution.swapCalldata,
      )
    })

    it('execute works for CL pool via raw params', async () => {
      const provider = createProvider(OP_CHAIN_ID, {
        marketAllowlist: [
          { assets: [USDC, WETH], tickSpacing: 100, chainId: OP_CHAIN_ID },
        ],
      })

      const result = await provider.execute({
        amountIn: 100,
        assetIn: USDC,
        assetOut: WETH,
        chainId: OP_CHAIN_ID,
        walletAddress: WALLET,
      })

      expect(result.transactionData.swap).toBeDefined()
      expect(result.amountOut).toBeGreaterThan(0)
    })

    it('getQuote works for CL pool via getQuote', async () => {
      const provider = createProvider(OP_CHAIN_ID, {
        marketAllowlist: [
          { assets: [USDC, WETH], tickSpacing: 100, chainId: OP_CHAIN_ID },
        ],
      })

      const quote = await provider.getQuote({
        assetIn: USDC,
        assetOut: WETH,
        amountIn: 100,
        chainId: OP_CHAIN_ID,
      })

      expect(quote.price).toBeTypeOf('number')
      expect(quote.amountOut).toBeGreaterThan(0)
    })

    it('throws for CL on unsupported chain', async () => {
      const MODE_CHAIN_ID = 34443 as SupportedChainId
      const modeUsdc: Asset = {
        type: 'erc20',
        address: {
          [MODE_CHAIN_ID]:
            '0x5555555555555555555555555555555555555555' as Address,
        },
        metadata: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
      }
      const modeWeth: Asset = {
        type: 'erc20',
        address: {
          [MODE_CHAIN_ID]:
            '0x4200000000000000000000000000000000000006' as Address,
        },
        metadata: { name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
      }

      const provider = new VelodromeSwapProvider(
        {
          defaultSlippage: 0.005,
          marketAllowlist: [
            {
              assets: [modeUsdc, modeWeth],
              tickSpacing: 100,
              chainId: MODE_CHAIN_ID,
            },
          ],
        },
        createMockChainManager(MODE_CHAIN_ID),
      )

      await expect(
        provider.getQuote({
          assetIn: modeUsdc,
          assetOut: modeWeth,
          amountIn: 100,
          chainId: MODE_CHAIN_ID,
        }),
      ).rejects.toThrow('CL pools not supported on chain')
    })
  })

  describe('supported chains', () => {
    it('includes all 14 configured chains', () => {
      const provider = createProvider(OP_CHAIN_ID)
      const chainIds = provider.protocolSupportedChainIds()

      // Hub chains
      expect(chainIds).toContain(10) // Optimism
      expect(chainIds).toContain(8453) // Base
      expect(chainIds).toContain(84532) // Base Sepolia

      // Leaf chains
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
