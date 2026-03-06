import type { Address, PublicClient } from 'viem'
import { baseSepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'

import type { UniswapSwapProviderConfig } from '../types.js'
import { UniswapSwapProvider } from '../UniswapSwapProvider.js'

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
      .mockImplementation(({ args }: { args: unknown[] }) => {
        // Permit2 allowance has 3 args: (owner, token, spender)
        // ERC20 allowance has 2 args: (owner, spender)
        if (args?.length === 3) {
          return Promise.resolve([0n, 0, 0])
        }
        return Promise.resolve(0n)
      }),
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
        walletAddress: '0xwallet' as Address,
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
        walletAddress: '0xwallet' as Address,
      })

      // Mock readContract returns 0n (no allowance), so approvals should be needed
      expect(result.transactionData.tokenApproval).toBeDefined()
      expect(result.transactionData.permit2Approval).toBeDefined()
    })

    it('throws without fee/tickSpacing in market filter', async () => {
      const provider = createProvider({
        marketAllowlist: [{ assets: [USDC, OP], chainId: CHAIN_ID }],
      })

      await expect(
        provider.execute({
          amountIn: 100,
          assetIn: USDC,
          assetOut: OP,
          chainId: CHAIN_ID,
          walletAddress: '0xwallet' as Address,
        }),
      ).rejects.toThrow('fee and tickSpacing must be configured')
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
  })

  describe('getMarkets', () => {
    it('returns empty array when no subgraph available', async () => {
      const provider = createProvider()
      const markets = await provider.getMarkets({})
      // Base Sepolia has no subgraph configured, so returns empty
      expect(markets).toEqual([])
    })
  })

  describe('getMarket', () => {
    it('throws when subgraph not available', async () => {
      const provider = createProvider()
      await expect(
        provider.getMarket({ poolId: '0xpool', chainId: CHAIN_ID }),
      ).rejects.toThrow('Subgraph not available')
    })
  })
})
