import { describe, expect, it } from 'vitest'

import {
  BASE_SEPOLIA_ID,
  collateralAsset,
  market as borrowMarket,
} from '@/actions/borrow/__tests__/fixtures.js'
import { borrowModule } from '@/actions/borrow/module.js'
import { lendModule } from '@/actions/lend/module.js'
import { ACTION_MODULES, ACTION_NAMES } from '@/actions/registry.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendMarketConfig } from '@/types/index.js'

const lendMarket: LendMarketConfig = {
  address: '0x018e22BBC6eB3daCfd151d1Cc4Dc72f6337B3eA1',
  chainId: BASE_SEPOLIA_ID,
  name: 'Demo USDC',
  asset: collateralAsset,
  lendProvider: 'morpho',
}

function makeDeps() {
  const chainManager = new MockChainManager({
    supportedChains: [BASE_SEPOLIA_ID],
  }) as unknown as ChainManager
  return { chainManager }
}

describe('ACTION_MODULES registry', () => {
  it('registers every action with a matching name field', () => {
    for (const name of ACTION_NAMES) {
      expect(ACTION_MODULES[name].name).toBe(name)
    }
  })

  it('lists actions in stable order', () => {
    expect(ACTION_NAMES).toEqual(['lend', 'swap', 'borrow'])
  })
})

describe('lendModule', () => {
  it('returns an empty registry when config is undefined', () => {
    const providers = lendModule.buildProviders(undefined, makeDeps())
    expect(providers).toEqual({})
    expect(lendModule.isConfigured(providers)).toBe(false)
  })

  it('builds a morpho provider when config.morpho is set', () => {
    const providers = lendModule.buildProviders(
      { morpho: { marketAllowlist: [lendMarket] } },
      makeDeps(),
    )
    expect(providers.morpho).toBeDefined()
    expect(lendModule.isConfigured(providers)).toBe(true)
  })

  it('builds an ActionsLendNamespace via the module hook', () => {
    const providers = lendModule.buildProviders(
      { morpho: { marketAllowlist: [lendMarket] } },
      makeDeps(),
    )
    const ns = lendModule.buildActionsNamespace?.(
      providers,
      makeDeps(),
      undefined,
    )
    expect(ns).toBeDefined()
  })
})

describe('borrowModule', () => {
  it('returns an empty registry when config is undefined', () => {
    const providers = borrowModule.buildProviders(undefined, makeDeps())
    expect(providers).toEqual({})
    expect(borrowModule.isConfigured(providers)).toBe(false)
  })

  it('builds a morpho provider when config.morpho is set', () => {
    const providers = borrowModule.buildProviders(
      { morpho: { marketAllowlist: [borrowMarket] } },
      makeDeps(),
    )
    expect(providers.morpho).toBeDefined()
    expect(borrowModule.isConfigured(providers)).toBe(true)
  })

  it('threads borrow settings into the namespace via the module hook', () => {
    const providers = borrowModule.buildProviders(
      {
        morpho: { marketAllowlist: [borrowMarket] },
        settings: { healthBufferPct: 0.1 },
      },
      makeDeps(),
    )
    expect(providers.morpho?.defaultHealthBufferPct).toBeCloseTo(0.1)
  })
})
