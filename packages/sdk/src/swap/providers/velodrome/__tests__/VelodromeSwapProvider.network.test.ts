/**
 * Network fork tests for VelodromeSwapProvider.
 *
 * Forks real networks via Anvil to verify swap quoting and encoding
 * against deployed Velodrome/Aerodrome contracts.
 *
 * Run: pnpm test:network
 * Requires: anvil (from foundry) and network access
 */
import { type ChildProcess, spawn } from 'node:child_process'

import type { Address } from 'viem'
import { createPublicClient, http } from 'viem'
import { base, optimism } from 'viem/chains'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { VelodromeSwapProviderConfig } from '@/swap/providers/velodrome/types.js'
import { VelodromeSwapProvider } from '@/swap/providers/velodrome/VelodromeSwapProvider.js'
import type { Asset } from '@/types/asset.js'

// ── Real mainnet assets ──

const OP_USDC: Asset = {
  type: 'erc20',
  address: {
    [optimism.id]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' as Address,
  },
  metadata: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
}

const OP_WETH: Asset = {
  type: 'erc20',
  address: {
    [optimism.id]: '0x4200000000000000000000000000000000000006' as Address,
  },
  metadata: { name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
}

const OP_OP: Asset = {
  type: 'erc20',
  address: {
    [optimism.id]: '0x4200000000000000000000000000000000000042' as Address,
  },
  metadata: { name: 'Optimism', symbol: 'OP', decimals: 18 },
}

const BASE_USDC: Asset = {
  type: 'erc20',
  address: {
    [base.id]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  },
  metadata: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
}

const BASE_WETH: Asset = {
  type: 'erc20',
  address: {
    [base.id]: '0x4200000000000000000000000000000000000006' as Address,
  },
  metadata: { name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
}

// ── Anvil fork helpers ──

interface AnvilFork {
  port: number
  process: ChildProcess
  rpcUrl: string
}

async function startAnvilFork(
  forkUrl: string,
  port: number,
): Promise<AnvilFork> {
  const proc = spawn(
    'anvil',
    ['--fork-url', forkUrl, '--port', String(port), '--silent'],
    {
      stdio: 'ignore',
    },
  )

  const rpcUrl = `http://127.0.0.1:${port}`
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1,
        }),
      })
      if (res.ok) return { port, process: proc, rpcUrl }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  proc.kill()
  throw new Error(`Anvil fork on port ${port} did not start in time`)
}

function stopAnvilFork(fork: AnvilFork) {
  fork.process.kill()
}

function createForkChainManager(
  rpcUrl: string,
  chain: typeof optimism | typeof base,
): ChainManager {
  const client = createPublicClient({ chain, transport: http(rpcUrl) })
  return {
    getPublicClient: () => client,
    getSupportedChains: () => [chain.id],
  } as unknown as ChainManager
}

function createProvider(
  chainId: SupportedChainId,
  chainManager: ChainManager,
  config: Partial<VelodromeSwapProviderConfig> = {},
): VelodromeSwapProvider {
  return new VelodromeSwapProvider(
    { defaultSlippage: 0.005, ...config },
    chainManager,
  )
}

// ── Tests ──

describe('VelodromeSwapProvider network fork tests', () => {
  let opFork: AnvilFork
  let baseFork: AnvilFork

  beforeAll(async () => {
    const opRpc = process.env.OP_MAINNET_RPC || 'https://mainnet.optimism.io'
    const baseRpc = process.env.BASE_MAINNET_RPC || 'https://mainnet.base.org'

    ;[opFork, baseFork] = await Promise.all([
      startAnvilFork(opRpc, 18545),
      startAnvilFork(baseRpc, 18546),
    ])
  }, 60_000)

  afterAll(() => {
    if (opFork) stopAnvilFork(opFork)
    if (baseFork) stopAnvilFork(baseFork)
  })

  describe('Optimism — v2 router', () => {
    it('getQuote returns valid quote for USDC/OP volatile pool', async () => {
      const chainManager = createForkChainManager(opFork.rpcUrl, optimism)
      const provider = createProvider(
        optimism.id as SupportedChainId,
        chainManager,
        {
          marketAllowlist: [
            {
              assets: [OP_USDC, OP_OP],
              stable: false,
              chainId: optimism.id as SupportedChainId,
            },
          ],
        },
      )

      const quote = await provider.getQuote({
        assetIn: OP_USDC,
        assetOut: OP_OP,
        amountIn: 10,
        chainId: optimism.id as SupportedChainId,
      })

      expect(quote.amountIn).toBe(10)
      expect(quote.amountInRaw).toBe(10_000_000n) // 10 USDC = 10e6
      expect(quote.amountOut).toBeGreaterThan(0)
      expect(quote.amountOutRaw).toBeGreaterThan(0n)
      expect(quote.price).toBeGreaterThan(0)
      expect(quote.execution.swapCalldata).toMatch(/^0x/)
      expect(quote.provider).toBe('velodrome')
      expect(quote.route.pools).toHaveLength(1)
    })

    it('getQuote returns valid quote for USDC/WETH volatile pool', async () => {
      const chainManager = createForkChainManager(opFork.rpcUrl, optimism)
      const provider = createProvider(
        optimism.id as SupportedChainId,
        chainManager,
        {
          marketAllowlist: [
            {
              assets: [OP_USDC, OP_WETH],
              stable: false,
              chainId: optimism.id as SupportedChainId,
            },
          ],
        },
      )

      const quote = await provider.getQuote({
        assetIn: OP_USDC,
        assetOut: OP_WETH,
        amountIn: 100,
        chainId: optimism.id as SupportedChainId,
      })

      expect(quote.amountOut).toBeGreaterThan(0)
      expect(quote.price).toBeGreaterThan(0)
      expect(quote.amountOutMin).toBeLessThan(quote.amountOut)
    })
  })

  describe('Base — v2 router (Aerodrome)', () => {
    it('getQuote returns valid quote for USDC/WETH volatile pool', async () => {
      const chainManager = createForkChainManager(baseFork.rpcUrl, base)
      const provider = createProvider(
        base.id as SupportedChainId,
        chainManager,
        {
          marketAllowlist: [
            {
              assets: [BASE_USDC, BASE_WETH],
              stable: false,
              chainId: base.id as SupportedChainId,
            },
          ],
        },
      )

      const quote = await provider.getQuote({
        assetIn: BASE_USDC,
        assetOut: BASE_WETH,
        amountIn: 100,
        chainId: base.id as SupportedChainId,
      })

      expect(quote.amountOut).toBeGreaterThan(0)
      expect(quote.price).toBeGreaterThan(0)
      expect(quote.execution.swapCalldata).toMatch(/^0x/)
    })
  })

  describe('Optimism — CL/Slipstream pool', () => {
    it('getQuote returns valid quote for WETH/USDC CL pool', async () => {
      const chainManager = createForkChainManager(opFork.rpcUrl, optimism)
      const provider = createProvider(
        optimism.id as SupportedChainId,
        chainManager,
        {
          marketAllowlist: [
            {
              assets: [OP_USDC, OP_WETH],
              tickSpacing: 100,
              chainId: optimism.id as SupportedChainId,
            },
          ],
        },
      )

      const quote = await provider.getQuote({
        assetIn: OP_USDC,
        assetOut: OP_WETH,
        amountIn: 100,
        chainId: optimism.id as SupportedChainId,
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
      const chainManager = createForkChainManager(baseFork.rpcUrl, base)
      const provider = createProvider(
        base.id as SupportedChainId,
        chainManager,
        {
          marketAllowlist: [
            {
              assets: [BASE_USDC, BASE_WETH],
              tickSpacing: 100,
              chainId: base.id as SupportedChainId,
            },
          ],
        },
      )

      const quote = await provider.getQuote({
        assetIn: BASE_USDC,
        assetOut: BASE_WETH,
        amountIn: 100,
        chainId: base.id as SupportedChainId,
      })

      expect(quote.amountOut).toBeGreaterThan(0)
      expect(quote.amountOutRaw).toBeGreaterThan(0n)
      expect(quote.price).toBeGreaterThan(0)
      expect(quote.execution.swapCalldata).toMatch(/^0x/)
    })

    it('execute(quote) produces valid transaction data', async () => {
      const chainManager = createForkChainManager(baseFork.rpcUrl, base)
      const provider = createProvider(
        base.id as SupportedChainId,
        chainManager,
        {
          marketAllowlist: [
            {
              assets: [BASE_USDC, BASE_WETH],
              tickSpacing: 100,
              chainId: base.id as SupportedChainId,
            },
          ],
        },
      )

      const quote = await provider.getQuote({
        assetIn: BASE_USDC,
        assetOut: BASE_WETH,
        amountIn: 100,
        chainId: base.id as SupportedChainId,
        recipient: '0x000000000000000000000000000000000000dEaD' as Address,
      })

      const tx = await provider.execute(quote)

      expect(tx.transactionData.swap.data).toBe(quote.execution.swapCalldata)
      expect(tx.amountIn).toBe(quote.amountIn)
      expect(tx.price).toBe(quote.price)
    })
  })
})
