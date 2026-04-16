/**
 * Network fork tests for VelodromeSwapProvider.
 *
 * Forks real networks via Anvil to verify swap quoting and encoding
 * against deployed Velodrome/Aerodrome contracts.
 *
 * Run: pnpm test:network
 * Requires: anvil (from foundry) and network access
 */
import type { Address } from 'viem'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { VelodromeSwapProviderConfig } from '@/swap/providers/velodrome/types.js'
import { VelodromeSwapProvider } from '@/swap/providers/velodrome/VelodromeSwapProvider.js'
import {
  BASE_USDC,
  BASE_WETH,
  FORK_CHAINS,
  OP_OP,
  OP_USDC,
  OP_WETH,
} from '@/test/network/fixtures/index.js'
import {
  type AnvilFork,
  startFork,
  stopAllForks,
} from '@/test/network/harness/index.js'
import { createForkChainManager } from '@/test/network/harness/wallets.js'

let opFork: AnvilFork
let baseFork: AnvilFork

function createProvider(
  fork: AnvilFork,
  config: Partial<VelodromeSwapProviderConfig> = {},
): VelodromeSwapProvider {
  const forkMap = new Map<SupportedChainId, AnvilFork>()
  forkMap.set(fork.config.chainId, fork)
  const chainManager = createForkChainManager(forkMap)
  return new VelodromeSwapProvider(
    { defaultSlippage: 0.005, ...config },
    chainManager,
  )
}

describe('VelodromeSwapProvider network fork tests', () => {
  beforeAll(async () => {
    ;[opFork, baseFork] = await Promise.all([
      startFork(FORK_CHAINS.optimism),
      startFork(FORK_CHAINS.base),
    ])
  }, 60_000)

  afterAll(() => stopAllForks())

  describe('Optimism — v2 router', () => {
    it('getQuote returns valid quote for USDC/OP volatile pool', async () => {
      const provider = createProvider(opFork, {
        marketAllowlist: [
          {
            assets: [OP_USDC, OP_OP],
            stable: false,
            chainId: opFork.config.chainId,
          },
        ],
      })

      const quote = await provider.getQuote({
        assetIn: OP_USDC,
        assetOut: OP_OP,
        amountIn: 10,
        chainId: opFork.config.chainId,
      })

      expect(quote.amountIn).toBe(10)
      expect(quote.amountInRaw).toBe(10_000_000n)
      expect(quote.amountOut).toBeGreaterThan(0)
      expect(quote.amountOutRaw).toBeGreaterThan(0n)
      expect(quote.price).toBeGreaterThan(0)
      expect(quote.execution.swapCalldata).toMatch(/^0x/)
      expect(quote.provider).toBe('velodrome')
      expect(quote.route.pools).toHaveLength(1)
    })

    it('getQuote returns valid quote for USDC/WETH volatile pool', async () => {
      const provider = createProvider(opFork, {
        marketAllowlist: [
          {
            assets: [OP_USDC, OP_WETH],
            stable: false,
            chainId: opFork.config.chainId,
          },
        ],
      })

      const quote = await provider.getQuote({
        assetIn: OP_USDC,
        assetOut: OP_WETH,
        amountIn: 100,
        chainId: opFork.config.chainId,
      })

      expect(quote.amountOut).toBeGreaterThan(0)
      expect(quote.price).toBeGreaterThan(0)
      expect(quote.amountOutMin).toBeLessThan(quote.amountOut)
    })
  })

  describe('Base — v2 router (Aerodrome)', () => {
    it('getQuote returns valid quote for USDC/WETH volatile pool', async () => {
      const provider = createProvider(baseFork, {
        marketAllowlist: [
          {
            assets: [BASE_USDC, BASE_WETH],
            stable: false,
            chainId: baseFork.config.chainId,
          },
        ],
      })

      const quote = await provider.getQuote({
        assetIn: BASE_USDC,
        assetOut: BASE_WETH,
        amountIn: 100,
        chainId: baseFork.config.chainId,
      })

      expect(quote.amountOut).toBeGreaterThan(0)
      expect(quote.price).toBeGreaterThan(0)
      expect(quote.execution.swapCalldata).toMatch(/^0x/)
    })
  })

  describe('Optimism — CL/Slipstream pool', () => {
    it('getQuote returns valid quote for WETH/USDC CL pool', async () => {
      const provider = createProvider(opFork, {
        marketAllowlist: [
          {
            assets: [OP_USDC, OP_WETH],
            tickSpacing: 100,
            chainId: opFork.config.chainId,
          },
        ],
      })

      const quote = await provider.getQuote({
        assetIn: OP_USDC,
        assetOut: OP_WETH,
        amountIn: 100,
        chainId: opFork.config.chainId,
      })

      expect(quote.amountOut).toBeGreaterThan(0)
      expect(quote.amountOutRaw).toBeGreaterThan(0n)
      expect(quote.price).toBeGreaterThan(0)
      expect(quote.execution.swapCalldata).toMatch(/^0x/)
      expect(quote.provider).toBe('velodrome')
    })
  })

  describe('Base — CL/Slipstream pool (Aerodrome)', () => {
    it('getQuote returns valid quote for USDC/WETH CL pool', async () => {
      const provider = createProvider(baseFork, {
        marketAllowlist: [
          {
            assets: [BASE_USDC, BASE_WETH],
            tickSpacing: 100,
            chainId: baseFork.config.chainId,
          },
        ],
      })

      const quote = await provider.getQuote({
        assetIn: BASE_USDC,
        assetOut: BASE_WETH,
        amountIn: 100,
        chainId: baseFork.config.chainId,
      })

      expect(quote.amountOut).toBeGreaterThan(0)
      expect(quote.amountOutRaw).toBeGreaterThan(0n)
      expect(quote.price).toBeGreaterThan(0)
      expect(quote.execution.swapCalldata).toMatch(/^0x/)
    })

    it('execute returns valid transaction data', async () => {
      const provider = createProvider(baseFork, {
        marketAllowlist: [
          {
            assets: [BASE_USDC, BASE_WETH],
            tickSpacing: 100,
            chainId: baseFork.config.chainId,
          },
        ],
      })

      const quote = await provider.getQuote({
        assetIn: BASE_USDC,
        assetOut: BASE_WETH,
        amountIn: 100,
        chainId: baseFork.config.chainId,
        recipient: '0x000000000000000000000000000000000000dEaD' as Address,
      })

      const tx = await provider.execute(quote)

      expect(tx.transactionData.swap.data).toBe(quote.execution.swapCalldata)
      expect(tx.amountIn).toBe(quote.amountIn)
      expect(tx.price).toBe(quote.price)
    })
  })
})
