import type { EnsInfo, NodeActionsConfig } from '@eth-optimism/actions-sdk'
import { mainnet, optimismSepolia } from 'viem/chains'
import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  baseContext,
  type CliActions,
  installEnsFallbackWarning,
} from '@/context/baseContext.js'

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

const NULL_INFO: EnsInfo = {
  avatar: null,
  display: null,
  description: null,
  url: null,
  email: null,
  keywords: null,
  twitter: null,
  github: null,
  discord: null,
  reddit: null,
}

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
    await actions.ens.getAddress('vitalik.eth')
    expect(String(stderrSpy.mock.calls[0]?.[0])).toContain('Warning:')
  })

  it('warns once across ENS methods for a single context', async () => {
    const { actions, getAddress, getName, getInfo } = fakeActions()

    installEnsFallbackWarning(actions, configWithChains([optimismSepolia.id]))

    await actions.ens.getAddress('vitalik.eth')
    await actions.ens.getName(VITALIK)
    await actions.ens.getInfo('vitalik.eth')

    expect(stderrSpy).toHaveBeenCalledTimes(1)
    expect(getAddress).toHaveBeenCalledWith('vitalik.eth')
    expect(getName).toHaveBeenCalledWith(VITALIK)
    expect(getInfo).toHaveBeenCalledWith('vitalik.eth')
  })

  it('does not warn when mainnet is configured', async () => {
    const { actions } = fakeActions()

    installEnsFallbackWarning(actions, configWithChains([mainnet.id]))
    await actions.ens.getName(VITALIK)

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
  const getAddress = vi.fn(async () => VITALIK)
  const getName = vi.fn(async () => 'vitalik.eth')
  const getInfo = vi.fn(async () => NULL_INFO)
  const actions = {
    ens: {
      getAddress,
      getName,
      getInfo,
    },
  } as unknown as CliActions
  return { actions, getAddress, getName, getInfo }
}
