import type { PublicClient } from 'viem'
import { base, baseSepolia, mode, optimism } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import {
  MOCK_POOL,
  MOCK_WALLET,
  MockETHAsset as ETH,
  MockUSDCAsset as USDC,
  MockWETHAsset as WETH,
} from '@/__mocks__/MockAssets.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { VelodromeSwapProviderConfig } from '@/swap/providers/velodrome/types.js'
import { VelodromeSwapProvider } from '@/swap/providers/velodrome/VelodromeSwapProvider.js'

const OP_CHAIN_ID = optimism.id as SupportedChainId
const BASE_CHAIN_ID = base.id as SupportedChainId
const BASE_SEPOLIA_CHAIN_ID = baseSepolia.id as SupportedChainId

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
        walletAddress: MOCK_WALLET,
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
        walletAddress: MOCK_WALLET,
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
        walletAddress: MOCK_WALLET,
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
      const MODE_CHAIN_ID = mode.id as SupportedChainId

      const provider = new VelodromeSwapProvider(
        {
          defaultSlippage: 0.005,
          marketAllowlist: [
            {
              assets: [USDC, WETH],
              stable: false,
              chainId: MODE_CHAIN_ID,
            },
          ],
        },
        createMockChainManager(MODE_CHAIN_ID),
      )

      const result = await provider.execute({
        amountIn: 100,
        assetIn: USDC,
        assetOut: WETH,
        chainId: MODE_CHAIN_ID,
        walletAddress: MOCK_WALLET,
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
        walletAddress: MOCK_WALLET,
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
        walletAddress: MOCK_WALLET,
      })

      // Approval needed for USDC
      expect(result.transactionData.tokenApproval).toBeDefined()
      // Swap tx should have zero value (not sending ETH)
      expect(result.transactionData.swap.value).toBe(0n)
    })
  })
})
