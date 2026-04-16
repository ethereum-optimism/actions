/**
 * Network fork tests for ActionsLendNamespace (read-only).
 *
 * Validates that the read-only namespace correctly delegates to providers
 * for market discovery and reads without requiring a wallet.
 *
 * Run: pnpm test:network
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { ActionsLendNamespace } from '@/lend/namespaces/ActionsLendNamespace.js'
import { AaveLendProvider } from '@/lend/providers/aave/AaveLendProvider.js'
import { MorphoLendProvider } from '@/lend/providers/morpho/MorphoLendProvider.js'
import {
  FORK_CHAINS,
  MORPHO_VAULTS,
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

describe('ActionsLendNamespace network fork tests (read-only)', () => {
  beforeAll(async () => {
    ;[opFork, baseFork] = await Promise.all([
      startFork(FORK_CHAINS.optimism),
      startFork(FORK_CHAINS.base),
    ])
  }, 60_000)

  afterAll(() => stopAllForks())

  describe('single provider — Aave on Optimism', () => {
    it('getMarkets returns non-empty list', async () => {
      const forkMap = new Map<SupportedChainId, AnvilFork>()
      forkMap.set(opFork.config.chainId, opFork)
      const chainManager = createForkChainManager(forkMap)

      const aave = new AaveLendProvider({}, chainManager)
      const ns = new ActionsLendNamespace({ aave })

      const markets = await ns.getMarkets({
        chainId: opFork.config.chainId,
      })

      expect(markets.length).toBeGreaterThan(0)
      for (const m of markets) {
        expect(m.marketId.chainId).toBe(opFork.config.chainId)
      }
    })

    it('getMarket returns valid WETH data', async () => {
      const forkMap = new Map<SupportedChainId, AnvilFork>()
      forkMap.set(opFork.config.chainId, opFork)
      const chainManager = createForkChainManager(forkMap)

      const aave = new AaveLendProvider({}, chainManager)
      const ns = new ActionsLendNamespace({ aave })

      const wethAddress = OP_WETH.address[opFork.config.chainId]!

      const market = await ns.getMarket({
        address: wethAddress as `0x${string}`,
        chainId: opFork.config.chainId,
      })

      expect(market.marketId.address).toBe(wethAddress)
      expect(market.apy.total).toBeGreaterThanOrEqual(0)
    })

    it('supportedChainIds includes Optimism', () => {
      const forkMap = new Map<SupportedChainId, AnvilFork>()
      forkMap.set(opFork.config.chainId, opFork)
      const chainManager = createForkChainManager(forkMap)

      const aave = new AaveLendProvider({}, chainManager)
      const ns = new ActionsLendNamespace({ aave })

      expect(ns.supportedChainIds()).toContain(opFork.config.chainId)
    })
  })

  describe('single provider — Aave on Base', () => {
    it('getMarkets returns non-empty list', async () => {
      const forkMap = new Map<SupportedChainId, AnvilFork>()
      forkMap.set(baseFork.config.chainId, baseFork)
      const chainManager = createForkChainManager(forkMap)

      const aave = new AaveLendProvider({}, chainManager)
      const ns = new ActionsLendNamespace({ aave })

      const markets = await ns.getMarkets({
        chainId: baseFork.config.chainId,
      })

      expect(markets.length).toBeGreaterThan(0)
    })
  })

  describe('multi-provider — Aave + Morpho on Optimism', () => {
    it('getMarkets aggregates from both providers', async () => {
      const forkMap = new Map<SupportedChainId, AnvilFork>()
      forkMap.set(opFork.config.chainId, opFork)
      const chainManager = createForkChainManager(forkMap)

      const aave = new AaveLendProvider({}, chainManager)
      const morpho = new MorphoLendProvider(
        { marketAllowlist: [MORPHO_VAULTS.opSteakhouseUSDC] },
        chainManager,
      )

      const ns = new ActionsLendNamespace({ aave, morpho })

      const markets = await ns.getMarkets({
        chainId: opFork.config.chainId,
      })

      // Aave alone returns many markets on OP, so a count check is not enough.
      // Explicitly verify the pinned Morpho vault is present.
      const marketAddresses = markets.map((m) =>
        m.marketId.address.toLowerCase(),
      )
      expect(marketAddresses).toContain(
        MORPHO_VAULTS.opSteakhouseUSDC.address.toLowerCase(),
      )
      // At least one Aave market must also be present
      const nonMorphoMarkets = markets.filter(
        (m) =>
          m.marketId.address.toLowerCase() !==
          MORPHO_VAULTS.opSteakhouseUSDC.address.toLowerCase(),
      )
      expect(nonMorphoMarkets.length).toBeGreaterThan(0)
    })
  })
})
