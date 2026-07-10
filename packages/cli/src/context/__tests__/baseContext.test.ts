import type { NodeActionsConfig } from '@eth-optimism/actions-sdk'
import { mainnet, optimismSepolia } from 'viem/chains'
import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MOCK_ADDRESS,
  MOCK_ENS_INFO,
  MOCK_ENS_NAME,
} from '@/__tests__/helpers/ens.js'
import {
  baseContext,
  type CliActions,
  installEnsFallbackWarning,
} from '@/context/baseContext.js'

describe('baseContext', () => {
  let stderrSpy: MockInstance

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an Actions instance and the resolved config', () => {
    const { config, actions } = baseContext()
    expect(config.chains.length).toBeGreaterThan(0)
    expect(actions).toBeDefined()
    expect(typeof actions.getSupportedAssets).toBe('function')
  })

  it('returns a fresh Actions instance per call', () => {
    const a = baseContext()
    const b = baseContext()
    expect(a.actions).not.toBe(b.actions)
  })

  it('does not require PRIVATE_KEY', () => {
    const originalEnv = process.env
    process.env = { ...originalEnv }
    delete process.env.PRIVATE_KEY
    try {
      expect(() => baseContext()).not.toThrow()
    } finally {
      process.env = originalEnv
    }
  })

  it('does not warn until an ENS method uses the SDK mainnet fallback', async () => {
    const { actions } = fakeActions()

    installEnsFallbackWarning(actions, configWithChains([optimismSepolia.id]))

    expect(stderrSpy).not.toHaveBeenCalled()
    await actions.ens.getAddress(MOCK_ENS_NAME)
    expect(String(stderrSpy.mock.calls[0]?.[0])).toContain('Warning:')
  })

  it('warns once across ENS methods for a single context', async () => {
    const { actions, getAddress, getName, getInfo } = fakeActions()

    installEnsFallbackWarning(actions, configWithChains([optimismSepolia.id]))

    await actions.ens.getAddress(MOCK_ENS_NAME)
    await actions.ens.getName(MOCK_ADDRESS)
    await actions.ens.getInfo(MOCK_ENS_NAME)

    expect(stderrSpy).toHaveBeenCalledTimes(1)
    expect(getAddress).toHaveBeenCalledWith(MOCK_ENS_NAME)
    expect(getName).toHaveBeenCalledWith(MOCK_ADDRESS)
    expect(getInfo).toHaveBeenCalledWith(MOCK_ENS_NAME)
  })

  it('does not warn when mainnet is configured', async () => {
    const { actions } = fakeActions()

    installEnsFallbackWarning(actions, configWithChains([mainnet.id]))
    await actions.ens.getName(MOCK_ADDRESS)

    expect(stderrSpy).not.toHaveBeenCalled()
  })
})

function configWithChains(
  chainIds: readonly number[],
): NodeActionsConfig<never> {
  return {
    chains: chainIds.map((chainId) => ({ chainId })),
  } as NodeActionsConfig<never>
}

function fakeActions() {
  const getAddress = vi.fn(async () => MOCK_ADDRESS)
  const getName = vi.fn(async () => MOCK_ENS_NAME)
  const getInfo = vi.fn(async () => MOCK_ENS_INFO)
  const actions = {
    ens: {
      getAddress,
      getName,
      getInfo,
    },
  } as unknown as CliActions
  return { actions, getAddress, getName, getInfo }
}
