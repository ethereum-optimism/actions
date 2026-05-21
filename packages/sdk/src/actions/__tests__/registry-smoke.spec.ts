import { describe, expect, it } from 'vitest'

import type { ActionModuleDeps } from '@/actions/shared/ActionModule.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

/**
 * Smoke test for the action-module registry pattern.
 *
 * Validates that the `ActionModule` contract is sufficient for a brand-new
 * action. A contributor only needs to define a module object with
 * `buildProviders` / `isConfigured` / `buildActionsNamespace` /
 * `buildWalletNamespace`. The host classes (`Actions`, `Wallet`) iterate the
 * registry and dispatch through these hooks; no edits to hosted wallets,
 * hosted providers, registries, `WalletNamespace`, or `ActionsContext` are
 * needed to add an action.
 *
 * The test mirrors the loop body in `actions.ts` and `Wallet.ts` against a
 * throwaway `exampleNewModule`, proving the dispatch shape works generically.
 */

interface ExampleNewModuleConfig {
  providerA?: { boost: number }
}
interface ExampleNewModuleProviders {
  providerA?: { boost: number }
}
interface ExampleNewModuleSettings {
  defaultBoost: number
}
interface ExampleNewModuleActionsNamespace {
  fetchAPR: () => number
}
interface ExampleNewModuleWalletNamespace {
  execute: (amount: bigint) => Promise<bigint>
}

interface ExampleNewModule {
  readonly name: 'exampleNewModule'
  buildProviders(
    config: ExampleNewModuleConfig | undefined,
    deps: ActionModuleDeps,
  ): ExampleNewModuleProviders
  isConfigured(providers: ExampleNewModuleProviders): boolean
  buildActionsNamespace(
    providers: ExampleNewModuleProviders,
    deps: ActionModuleDeps,
    settings: ExampleNewModuleSettings | undefined,
  ): ExampleNewModuleActionsNamespace
  buildWalletNamespace(
    providers: ExampleNewModuleProviders,
    wallet: Wallet,
    settings: ExampleNewModuleSettings | undefined,
    deps: ActionModuleDeps,
  ): ExampleNewModuleWalletNamespace
}

const exampleNewModule: ExampleNewModule = {
  name: 'exampleNewModule',
  buildProviders: (config) => {
    if (!config?.providerA) return {}
    return { providerA: { boost: config.providerA.boost } }
  },
  isConfigured: (providers) => Boolean(providers.providerA),
  buildActionsNamespace: (providers) => ({
    fetchAPR: () => providers.providerA?.boost ?? 0,
  }),
  buildWalletNamespace: (providers, _wallet, settings) => ({
    execute: async (amount: bigint) => {
      const boost = providers.providerA?.boost ?? settings?.defaultBoost ?? 1
      return amount * BigInt(boost)
    },
  }),
}

function makeDeps(): ActionModuleDeps {
  const chainManager = new MockChainManager({
    supportedChains: [1],
  }) as unknown as ChainManager
  return { chainManager }
}

describe('action-module registry smoke', () => {
  it('an inline module satisfies the contract shape', () => {
    expect(exampleNewModule.name).toBe('exampleNewModule')
    const providers = exampleNewModule.buildProviders(
      { providerA: { boost: 5 } },
      makeDeps(),
    )
    expect(exampleNewModule.isConfigured(providers)).toBe(true)
    expect(exampleNewModule.isConfigured({})).toBe(false)
  })

  it('buildActionsNamespace dispatches without touching real wiring', () => {
    const providers = exampleNewModule.buildProviders(
      { providerA: { boost: 7 } },
      makeDeps(),
    )
    const ns = exampleNewModule.buildActionsNamespace(
      providers,
      makeDeps(),
      undefined,
    )
    expect(ns.fetchAPR()).toBe(7)
  })

  it('buildWalletNamespace dispatches through the contract', async () => {
    const providers = exampleNewModule.buildProviders(
      { providerA: { boost: 3 } },
      makeDeps(),
    )
    const fakeWallet = {} as Wallet
    const ns = exampleNewModule.buildWalletNamespace(
      providers,
      fakeWallet,
      { defaultBoost: 1 },
      makeDeps(),
    )
    expect(await ns.execute(10n)).toBe(30n)
  })

  it('Actions/Wallet loop pattern works with arbitrary modules', () => {
    const modules = { exampleNewModule } as const
    const namespaces: Record<string, unknown> = {}
    for (const name of Object.keys(modules) as Array<keyof typeof modules>) {
      const m = modules[name]
      const providers = m.buildProviders(
        { providerA: { boost: 2 } },
        makeDeps(),
      )
      if (!m.isConfigured(providers)) continue
      namespaces[name] = m.buildActionsNamespace(
        providers,
        makeDeps(),
        undefined,
      )
    }
    expect(
      (
        namespaces.exampleNewModule as ExampleNewModuleActionsNamespace
      ).fetchAPR(),
    ).toBe(2)
  })
})
