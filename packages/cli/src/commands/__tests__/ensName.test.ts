import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runEnsName } from '@/commands/actions/ens/name.js'
import * as baseCtx from '@/context/baseContext.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

describe('runEnsName', () => {
  let writeSpy: MockInstance

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockEns = (getName: (address: string) => Promise<string | null>) => {
    vi.spyOn(baseCtx, 'baseContext').mockReturnValue({
      config: { chains: [] } as never,
      actions: { ens: { getName } } as never,
    })
  }

  it('reverse-resolves an address and emits { address, name }', async () => {
    const captured: string[] = []
    mockEns(async (address) => {
      captured.push(address)
      return 'vitalik.eth'
    })
    await runEnsName(VITALIK)
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body).toEqual({ address: VITALIK, name: 'vitalik.eth' })
    expect(captured).toEqual([VITALIK])
  })

  it('emits name: null when no primary record is set', async () => {
    mockEns(async () => null)
    await runEnsName(VITALIK)
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body).toEqual({ address: VITALIK, name: null })
  })

  it('checksums a lowercased address before forwarding', async () => {
    const captured: string[] = []
    mockEns(async (address) => {
      captured.push(address)
      return null
    })
    await runEnsName(VITALIK.toLowerCase())
    expect(captured).toEqual([VITALIK])
  })

  it('rejects a non-address input with CliError(validation)', async () => {
    mockEns(async () => null)
    try {
      await runEnsName('vitalik.eth')
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('maps RPC failures to CliError(network)', async () => {
    mockEns(async () => {
      throw new Error('fetch failed')
    })
    try {
      await runEnsName(VITALIK)
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
    }
  })
})
