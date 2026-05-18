import { describe, expect, it } from 'vitest'

import type { ActionModuleDeps } from '@/actions/shared/ActionModule.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

/**
 * Smoke test for the action-module registry pattern.
 *
 * Validates that the `ActionModule` contract is sufficient for a brand-new
 * action — a contributor only needs to define a module object with
 * `buildProviders` / `isConfigured` / `buildActionsNamespace` /
 * `buildWalletNamespace`. The host classes (`Actions`, `Wallet`) iterate the
 * registry and dispatch through these hooks; no edits to hosted wallets,
 * hosted providers, registries, `WalletNamespace`, or `ActionsContext` are
 * needed to add an action.
 *
 * The test mirrors the loop body in `actions.ts` and `Wallet.ts` against a
 * throwaway `restake` module, proving the dispatch shape works generically.
 */

interface RestakeConfig {
  providerA?: { boost: number }
}
interface RestakeProviders {
  providerA?: { boost: number }
}
interface RestakeSettings {
  defaultBoost: number
}
interface RestakeActionsNamespace {
  fetchAPR: () => number
}
interface RestakeWalletNamespace {
  restake: (amount: bigint) => Promise<bigint>
}

interface RestakeModule {
  readonly name: 'restake'
  buildProviders(
    config: RestakeConfig | undefined,
    deps: ActionModuleDeps,
  ): RestakeProviders
  isConfigured(providers: RestakeProviders): boolean
  buildActionsNamespace(
    providers: RestakeProviders,
    deps: ActionModuleDeps,
    settings: RestakeSettings | undefined,
  ): RestakeActionsNamespace
  buildWalletNamespace(
    providers: RestakeProviders,
    wallet: Wallet,
    settings: RestakeSettings | undefined,
    deps: ActionModuleDeps,
  ): RestakeWalletNamespace
}

const restakeModule: RestakeModule = {
  name: 'restake',
  buildProviders: (config) => {
    if (!config?.providerA) return {}
    return { providerA: { boost: config.providerA.boost } }
  },
  isConfigured: (providers) => Boolean(providers.providerA),
  buildActionsNamespace: (providers) => ({
    fetchAPR: () => providers.providerA?.boost ?? 0,
  }),
  buildWalletNamespace: (providers, _wallet, settings) => ({
    restake: async (amount: bigint) => {
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
    expect(restakeModule.name).toBe('restake')
    const providers = restakeModule.buildProviders(
      { providerA: { boost: 5 } },
      makeDeps(),
    )
    expect(restakeModule.isConfigured(providers)).toBe(true)
    expect(restakeModule.isConfigured({})).toBe(false)
  })

  it('buildActionsNamespace dispatches without touching real wiring', () => {
    const providers = restakeModule.buildProviders(
      { providerA: { boost: 7 } },
      makeDeps(),
    )
    const ns = restakeModule.buildActionsNamespace(
      providers,
      makeDeps(),
      undefined,
    )
    expect(ns.fetchAPR()).toBe(7)
  })

  it('buildWalletNamespace dispatches through the contract', async () => {
    const providers = restakeModule.buildProviders(
      { providerA: { boost: 3 } },
      makeDeps(),
    )
    const fakeWallet = {} as Wallet
    const ns = restakeModule.buildWalletNamespace(
      providers,
      fakeWallet,
      { defaultBoost: 1 },
      makeDeps(),
    )
    expect(await ns.restake(10n)).toBe(30n)
  })

  it('Actions/Wallet loop pattern works with arbitrary modules', () => {
    const modules = { restake: restakeModule } as const
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
    expect((namespaces.restake as RestakeActionsNamespace).fetchAPR()).toBe(2)
  })
})
