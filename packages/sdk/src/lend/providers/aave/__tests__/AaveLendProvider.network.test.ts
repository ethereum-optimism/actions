/**
 * Network fork tests for AaveLendProvider.
 *
 * Validates market discovery, position reads, and transaction construction
 * against real deployed Aave V3 contracts on Optimism and Base.
 *
 * Run: pnpm test:network
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { AaveLendProvider } from '@/lend/providers/aave/AaveLendProvider.js'
import {
  BASE_USDC,
  BASE_WETH,
  FORK_CHAINS,
  OP_USDC,
  OP_WETH,
} from '@/test/network/fixtures/index.js'
import {
  type AnvilFork,
  startFork,
  stopAllForks,
} from '@/test/network/harness/index.js'
import { createForkChainManager } from '@/test/network/harness/wallets.js'
import type { LendProviderConfig } from '@/types/actions.js'

let opFork: AnvilFork
let baseFork: AnvilFork

function createProvider(
  forks: AnvilFork[],
  config: LendProviderConfig = {},
): AaveLendProvider {
  const forkMap = new Map<SupportedChainId, AnvilFork>()
  for (const f of forks) forkMap.set(f.config.chainId, f)
  const chainManager = createForkChainManager(forkMap)
  return new AaveLendProvider(config, chainManager)
}

describe('AaveLendProvider network fork tests', () => {
  beforeAll(async () => {
    ;[opFork, baseFork] = await Promise.all([
      startFork(FORK_CHAINS.optimism),
      startFork(FORK_CHAINS.base),
    ])
  }, 60_000)

  afterAll(() => stopAllForks())

  describe('Optimism', () => {
    it('getMarkets returns non-empty market list', async () => {
      const provider = createProvider([opFork])

      const markets = await provider.getMarkets({
        chainId: opFork.config.chainId,
      })

      expect(markets.length).toBeGreaterThan(0)
      for (const market of markets) {
        expect(market.marketId.chainId).toBe(opFork.config.chainId)
        expect(market.asset).toBeDefined()
        expect(market.apy).toBeDefined()
      }
    })

    it('getMarket returns valid WETH market data', async () => {
      const provider = createProvider([opFork])
      const wethAddress = OP_WETH.address[opFork.config.chainId]!

      const market = await provider.getMarket({
        address: wethAddress as `0x${string}`,
        chainId: opFork.config.chainId,
      })

      expect(market.marketId.address).toBe(wethAddress)
      expect(market.marketId.chainId).toBe(opFork.config.chainId)
      expect(market.apy.total).toBeGreaterThanOrEqual(0)
      expect(market.supply.totalAssets).toBeGreaterThan(0)
    })

    it('openPosition builds valid supply transaction for USDC', async () => {
      const provider = createProvider([opFork])
      const usdcAddress = OP_USDC.address[opFork.config.chainId]!

      const tx = await provider.openPosition({
        marketId: {
          address: usdcAddress as `0x${string}`,
          chainId: opFork.config.chainId,
        },
        amount: 100,
        asset: OP_USDC,
        walletAddress: '0x000000000000000000000000000000000000dEaD',
      })

      expect(tx.transactionData.position.to).toMatch(/^0x/)
      expect(tx.transactionData.position.data).toMatch(/^0x/)
      expect(tx.amount).toBeGreaterThan(0n)
      expect(tx.asset).toBe(usdcAddress)
      // Aave ERC20 supply requires an approval
      expect(tx.transactionData.approval).toBeDefined()
      expect(tx.transactionData.approval!.to).toBe(usdcAddress)
    })
  })

  describe('Base', () => {
    it('getMarkets returns non-empty market list', async () => {
      const provider = createProvider([baseFork])

      const markets = await provider.getMarkets({
        chainId: baseFork.config.chainId,
      })

      expect(markets.length).toBeGreaterThan(0)
    })

    it('getMarket returns valid USDC market data', async () => {
      const provider = createProvider([baseFork])
      const usdcAddress = BASE_USDC.address[baseFork.config.chainId]!

      const market = await provider.getMarket({
        address: usdcAddress as `0x${string}`,
        chainId: baseFork.config.chainId,
      })

      expect(market.marketId.address).toBe(usdcAddress)
      expect(market.apy.total).toBeGreaterThanOrEqual(0)
    })
  })
})
