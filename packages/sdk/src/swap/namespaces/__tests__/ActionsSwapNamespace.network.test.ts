/**
 * Network fork tests for ActionsSwapNamespace (read-only).
 *
 * Validates that the read-only namespace correctly delegates to providers
 * for quoting and market discovery without requiring a wallet.
 *
 * Run: pnpm test:network
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { ActionsSwapNamespace } from '@/swap/namespaces/ActionsSwapNamespace.js'
import { UniswapSwapProvider } from '@/swap/providers/uniswap/UniswapSwapProvider.js'
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

describe('ActionsSwapNamespace network fork tests (read-only)', () => {
  beforeAll(async () => {
    ;[opFork, baseFork] = await Promise.all([
      startFork(FORK_CHAINS.optimism),
      startFork(FORK_CHAINS.base),
    ])
  }, 60_000)

  afterAll(() => stopAllForks())

  describe('single provider — Velodrome on Optimism', () => {
    it('getQuote returns a valid quote', async () => {
      const forkMap = new Map<SupportedChainId, AnvilFork>()
      forkMap.set(opFork.config.chainId, opFork)
      const chainManager = createForkChainManager(forkMap)

      const velodrome = new VelodromeSwapProvider(
        {
          defaultSlippage: 0.005,
          marketAllowlist: [
            {
              assets: [OP_USDC, OP_OP],
              stable: false,
              chainId: opFork.config.chainId,
            },
          ],
        },
        chainManager,
      )

      const ns = new ActionsSwapNamespace({ velodrome })

      const quote = await ns.getQuote({
        assetIn: OP_USDC,
        assetOut: OP_OP,
        amountIn: 10,
        chainId: opFork.config.chainId,
      })

      expect(quote.amountOut).toBeGreaterThan(0)
      expect(quote.price).toBeGreaterThan(0)
      expect(quote.provider).toBe('velodrome')
    })

    it('getMarkets returns markets from the allowlist', async () => {
      const forkMap = new Map<SupportedChainId, AnvilFork>()
      forkMap.set(opFork.config.chainId, opFork)
      const chainManager = createForkChainManager(forkMap)

      const velodrome = new VelodromeSwapProvider(
        {
          defaultSlippage: 0.005,
          marketAllowlist: [
            {
              assets: [OP_USDC, OP_OP],
              stable: false,
              chainId: opFork.config.chainId,
            },
            {
              assets: [OP_USDC, OP_WETH],
              stable: false,
              chainId: opFork.config.chainId,
            },
          ],
        },
        chainManager,
      )

      const ns = new ActionsSwapNamespace({ velodrome })

      const markets = await ns.getMarkets({
        chainId: opFork.config.chainId,
      })

      expect(markets.length).toBeGreaterThanOrEqual(2)
    })

    it('supportedChainIds reflects configured chains', () => {
      const forkMap = new Map<SupportedChainId, AnvilFork>()
      forkMap.set(opFork.config.chainId, opFork)
      const chainManager = createForkChainManager(forkMap)

      const velodrome = new VelodromeSwapProvider(
        { defaultSlippage: 0.005 },
        chainManager,
      )

      const ns = new ActionsSwapNamespace({ velodrome })
      const chains = ns.supportedChainIds()

      expect(chains).toContain(opFork.config.chainId)
    })
  })

  describe('multi-provider — Uniswap + Velodrome on Base', () => {
    it('getQuotes returns quotes from both providers', async () => {
      const forkMap = new Map<SupportedChainId, AnvilFork>()
      forkMap.set(baseFork.config.chainId, baseFork)
      const chainManager = createForkChainManager(forkMap)

      const uniswap = new UniswapSwapProvider(
        { defaultSlippage: 0.005 },
        chainManager,
      )

      const velodrome = new VelodromeSwapProvider(
        {
          defaultSlippage: 0.005,
          marketAllowlist: [
            {
              assets: [BASE_USDC, BASE_WETH],
              stable: false,
              chainId: baseFork.config.chainId,
            },
          ],
        },
        chainManager,
      )

      const ns = new ActionsSwapNamespace({ uniswap, velodrome })

      const quotes = await ns.getQuotes({
        assetIn: BASE_USDC,
        assetOut: BASE_WETH,
        amountIn: 100,
        chainId: baseFork.config.chainId,
      })

      // Both providers must contribute a quote for this pair on Base.
      // If either silently regresses, this catches it.
      const providerNames = new Set(quotes.map((q) => q.provider))
      expect(providerNames.has('uniswap')).toBe(true)
      expect(providerNames.has('velodrome')).toBe(true)

      expect(quotes.length).toBeGreaterThanOrEqual(2)
      for (const q of quotes) {
        expect(q.amountOut).toBeGreaterThan(0)
        expect(q.price).toBeGreaterThan(0)
      }
      // Best quote is first (sorted by amountOut descending)
      expect(quotes[0].amountOutRaw).toBeGreaterThanOrEqual(
        quotes[1].amountOutRaw,
      )
    })

    it('supportedChainIds includes Base from both providers', () => {
      const forkMap = new Map<SupportedChainId, AnvilFork>()
      forkMap.set(baseFork.config.chainId, baseFork)
      const chainManager = createForkChainManager(forkMap)

      const uniswap = new UniswapSwapProvider(
        { defaultSlippage: 0.005 },
        chainManager,
      )
      const velodrome = new VelodromeSwapProvider(
        { defaultSlippage: 0.005 },
        chainManager,
      )

      const ns = new ActionsSwapNamespace({ uniswap, velodrome })
      const chains = ns.supportedChainIds()

      expect(chains).toContain(baseFork.config.chainId)
    })
  })
})
