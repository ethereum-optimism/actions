/**
 * Network fork tests for MorphoLendProvider.
 *
 * Validates market reads and transaction construction against real deployed
 * Morpho Blue / MetaMorpho contracts. Uses pinned vault addresses from
 * well-known curators so test ordering is deterministic.
 *
 * Run: pnpm test:network
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { MorphoLendProvider } from '@/lend/providers/morpho/MorphoLendProvider.js'
import { FORK_CHAINS, MORPHO_VAULTS } from '@/test/network/fixtures/index.js'
import {
  type AnvilFork,
  startFork,
  stopAllForks,
} from '@/test/network/harness/index.js'
import { createForkChainManager } from '@/test/network/harness/wallets.js'
import type { LendProviderConfig } from '@/types/actions.js'
import type { LendMarketConfig } from '@/types/lend/index.js'

let mainnetFork: AnvilFork
let opFork: AnvilFork
let baseFork: AnvilFork

function createProvider(
  forks: AnvilFork[],
  vaults: LendMarketConfig[],
): MorphoLendProvider {
  const forkMap = new Map<SupportedChainId, AnvilFork>()
  for (const f of forks) forkMap.set(f.config.chainId, f)
  const chainManager = createForkChainManager(forkMap)
  const config: LendProviderConfig = { marketAllowlist: vaults }
  return new MorphoLendProvider(config, chainManager)
}

describe('MorphoLendProvider network fork tests', () => {
  beforeAll(async () => {
    ;[mainnetFork, opFork, baseFork] = await Promise.all([
      startFork(FORK_CHAINS.mainnet),
      startFork(FORK_CHAINS.optimism),
      startFork(FORK_CHAINS.base),
    ])
  }, 60_000)

  afterAll(() => stopAllForks())

  describe('Mainnet — Gauntlet USDC Core vault', () => {
    const vault = MORPHO_VAULTS.mainnetGauntletUSDC

    it('getMarket returns valid data for pinned vault', async () => {
      const provider = createProvider([mainnetFork], [vault])

      const market = await provider.getMarket({
        address: vault.address,
        chainId: vault.chainId,
      })

      expect(market.marketId.address.toLowerCase()).toBe(
        vault.address.toLowerCase(),
      )
      expect(market.marketId.chainId).toBe(vault.chainId)
      expect(market.name).toBe(vault.name)
      expect(market.apy.total).toBeGreaterThanOrEqual(0)
      expect(market.supply.totalAssets).toBeGreaterThan(0)
    })

    it('getMarkets returns exactly the allowlisted vaults', async () => {
      const provider = createProvider(
        [mainnetFork],
        [MORPHO_VAULTS.mainnetGauntletUSDC, MORPHO_VAULTS.mainnetGauntletWBTC],
      )

      const markets = await provider.getMarkets({
        chainId: mainnetFork.config.chainId,
      })

      expect(markets).toHaveLength(2)
      const addresses = markets.map((m) => m.marketId.address.toLowerCase())
      expect(addresses).toContain(
        MORPHO_VAULTS.mainnetGauntletUSDC.address.toLowerCase(),
      )
      expect(addresses).toContain(
        MORPHO_VAULTS.mainnetGauntletWBTC.address.toLowerCase(),
      )
    })
  })

  describe('Optimism — Steakhouse USDC vault', () => {
    const vault = MORPHO_VAULTS.opSteakhouseUSDC

    it('getMarket returns valid data for pinned vault', async () => {
      const provider = createProvider([opFork], [vault])

      const market = await provider.getMarket({
        address: vault.address,
        chainId: vault.chainId,
      })

      expect(market.marketId.address.toLowerCase()).toBe(
        vault.address.toLowerCase(),
      )
      expect(market.apy.total).toBeGreaterThanOrEqual(0)
      expect(market.supply.totalAssets).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Base — Gauntlet USDC Prime vault', () => {
    const vault = MORPHO_VAULTS.baseGauntletUSDC

    it('getMarket returns valid data for pinned vault', async () => {
      const provider = createProvider([baseFork], [vault])

      const market = await provider.getMarket({
        address: vault.address,
        chainId: vault.chainId,
      })

      expect(market.marketId.address.toLowerCase()).toBe(
        vault.address.toLowerCase(),
      )
      expect(market.apy.total).toBeGreaterThanOrEqual(0)
    })
  })
})
