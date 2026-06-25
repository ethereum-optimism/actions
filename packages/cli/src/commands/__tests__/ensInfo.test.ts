import type { EnsInfo } from '@eth-optimism/actions-sdk'
import { mainnet, optimismSepolia } from 'viem/chains'
import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runEnsInfo } from '@/commands/actions/ens/info.js'
import * as baseCtx from '@/context/baseContext.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

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

describe('runEnsInfo', () => {
  let writeSpy: MockInstance

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockEns = (
    getInfo: (input: string) => Promise<typeof NULL_INFO>,
    chains: Array<{ chainId: number }> = [{ chainId: mainnet.id }],
  ) => {
    vi.spyOn(baseCtx, 'baseContext').mockReturnValue({
      config: { chains } as never,
      actions: { ens: { getInfo } } as never,
    })
  }

  it('emits the SDK EnsInfo shape verbatim for a name', async () => {
    const captured: string[] = []
    const profile = {
      ...NULL_INFO,
      display: 'vitalik.eth',
      twitter: 'VitalikButerin',
    }
    mockEns(async (input) => {
      captured.push(input)
      return profile
    })
    await runEnsInfo('vitalik.eth')
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body).toEqual(profile)
    expect(captured).toEqual(['vitalik.eth'])
  })

  it('accepts a checksummed address input', async () => {
    const captured: string[] = []
    mockEns(async (input) => {
      captured.push(input)
      return NULL_INFO
    })
    await runEnsInfo(VITALIK.toLowerCase())
    expect(captured).toEqual([VITALIK])
  })

  it('rejects with CliError(config) when mainnet is not configured', async () => {
    mockEns(async () => NULL_INFO, [{ chainId: optimismSepolia.id }])
    try {
      await runEnsInfo('vitalik.eth')
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
    }
  })

  it('rejects an input that is neither name nor address with CliError(validation)', async () => {
    mockEns(async () => NULL_INFO)
    try {
      await runEnsInfo('notaname')
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('checks mainnet config before input shape (config wins over validation)', async () => {
    // Both conditions are violated: mainnet absent AND input is neither a name
    // nor an address. The mainnet guard must fire first so the caller learns it
    // is unconfigured rather than chasing a validation error it cannot reach.
    mockEns(async () => NULL_INFO, [{ chainId: optimismSepolia.id }])
    try {
      await runEnsInfo('notaname')
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
    }
  })

  it('maps RPC failures to CliError(network)', async () => {
    mockEns(async () => {
      throw new Error('fetch failed')
    })
    try {
      await runEnsInfo('vitalik.eth')
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
    }
  })
})
