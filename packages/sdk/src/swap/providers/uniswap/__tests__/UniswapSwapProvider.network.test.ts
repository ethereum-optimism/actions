/**
 * Network fork tests for UniswapSwapProvider.
 *
 * Validates quoting, market discovery, and transaction construction
 * against real deployed Uniswap V4 contracts on Mainnet, Optimism, and Base.
 *
 * Run: pnpm test:network
 */
import type { Address } from 'viem'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { UniswapSwapProvider } from '@/swap/providers/uniswap/UniswapSwapProvider.js'
import {
  BASE_USDC,
  BASE_WETH,
  FORK_CHAINS,
  MAINNET_USDC,
  MAINNET_WETH,
  OP_USDC,
  OP_WETH,
} from '@/test/network/fixtures/index.js'
import {
  type AnvilFork,
  startFork,
  stopAllForks,
} from '@/test/network/harness/index.js'
import { createForkChainManager } from '@/test/network/harness/wallets.js'

let mainnetFork: AnvilFork
let opFork: AnvilFork
let baseFork: AnvilFork

function createProvider(forks: AnvilFork[]): UniswapSwapProvider {
  const forkMap = new Map<SupportedChainId, AnvilFork>()
  for (const f of forks) forkMap.set(f.config.chainId, f)
  const chainManager = createForkChainManager(forkMap)
  return new UniswapSwapProvider({ defaultSlippage: 0.005 }, chainManager)
}

describe('UniswapSwapProvider network fork tests', () => {
  beforeAll(async () => {
    ;[mainnetFork, opFork, baseFork] = await Promise.all([
      startFork(FORK_CHAINS.mainnet),
      startFork(FORK_CHAINS.optimism),
      startFork(FORK_CHAINS.base),
    ])
  }, 60_000)

  afterAll(() => stopAllForks())

  describe('Mainnet', () => {
    it('getQuote returns valid quote for USDC -> WETH', async () => {
      const provider = createProvider([mainnetFork])

      const quote = await provider.getQuote({
        assetIn: MAINNET_USDC,
        assetOut: MAINNET_WETH,
        amountIn: 100,
        chainId: mainnetFork.config.chainId,
      })

      expect(quote.amountIn).toBe(100)
      expect(quote.amountInRaw).toBe(100_000_000n)
      expect(quote.amountOut).toBeGreaterThan(0)
      expect(quote.amountOutRaw).toBeGreaterThan(0n)
      expect(quote.price).toBeGreaterThan(0)
      expect(quote.execution.swapCalldata).toMatch(/^0x/)
      expect(quote.provider).toBe('uniswap')
    })

    it('execute returns valid transaction data for USDC -> WETH', async () => {
      const provider = createProvider([mainnetFork])
      const recipient = '0x000000000000000000000000000000000000dEaD' as Address

      const quote = await provider.getQuote({
        assetIn: MAINNET_USDC,
        assetOut: MAINNET_WETH,
        amountIn: 100,
        chainId: mainnetFork.config.chainId,
        recipient,
      })

      const tx = await provider.execute(quote)

      expect(tx.transactionData.swap.data).toMatch(/^0x/)
      expect(tx.transactionData.swap.to).toMatch(/^0x/)
      expect(tx.amountIn).toBe(quote.amountIn)
      expect(tx.price).toBe(quote.price)
    })
  })

  describe('Optimism', () => {
    it('getQuote returns valid quote for USDC -> WETH', async () => {
      const provider = createProvider([opFork])

      const quote = await provider.getQuote({
        assetIn: OP_USDC,
        assetOut: OP_WETH,
        amountIn: 100,
        chainId: opFork.config.chainId,
      })

      expect(quote.amountOut).toBeGreaterThan(0)
      expect(quote.price).toBeGreaterThan(0)
      expect(quote.execution.swapCalldata).toMatch(/^0x/)
      expect(quote.provider).toBe('uniswap')
    })
  })

  describe('Base', () => {
    it('getQuote returns valid quote for USDC -> WETH', async () => {
      const provider = createProvider([baseFork])

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

    it('execute returns transaction with Permit2 approval when needed', async () => {
      const provider = createProvider([baseFork])
      const recipient = '0x000000000000000000000000000000000000dEaD' as Address

      const quote = await provider.getQuote({
        assetIn: BASE_USDC,
        assetOut: BASE_WETH,
        amountIn: 50,
        chainId: baseFork.config.chainId,
        recipient,
      })

      const tx = await provider.execute(quote)

      expect(tx.transactionData.swap.data).toMatch(/^0x/)
      expect(tx.transactionData.swap.to).toMatch(/^0x/)
      // Uniswap uses Permit2, so we expect permit2Approval or tokenApproval
      const hasApproval = !!(
        tx.transactionData.permit2Approval || tx.transactionData.tokenApproval
      )
      expect(hasApproval).toBe(true)
    })
  })
})
