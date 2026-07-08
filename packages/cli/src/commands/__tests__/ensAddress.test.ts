import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runEnsAddress } from '@/commands/actions/ens/address.js'
import * as baseCtx from '@/context/baseContext.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

describe('runEnsAddress', () => {
  let writeSpy: MockInstance
  let stderrSpy: MockInstance

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockEns = (getAddress: (input: string) => Promise<string>) => {
    vi.spyOn(baseCtx, 'baseContext').mockReturnValue({
      config: { chains: [] } as never,
      actions: { ens: { getAddress } } as never,
    })
  }

  it('resolves a name and emits { name, address }', async () => {
    const captured: string[] = []
    mockEns(async (input) => {
      captured.push(input)
      return VITALIK
    })
    await runEnsAddress('vitalik.eth')
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body).toEqual({ name: 'vitalik.eth', address: VITALIK })
    expect(captured).toEqual(['vitalik.eth'])
  })

  it('rejects a non-name input with CliError(validation)', async () => {
    mockEns(async () => VITALIK)
    try {
      await runEnsAddress(VITALIK)
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('validates input before calling ENS', async () => {
    const getAddress = vi.fn(async () => VITALIK)
    mockEns(getAddress)
    try {
      await runEnsAddress('notaname')
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      expect(stderrSpy).not.toHaveBeenCalled()
      expect(getAddress).not.toHaveBeenCalled()
    }
  })

  it('maps RPC failures to CliError(network)', async () => {
    mockEns(async () => {
      throw new Error('fetch failed')
    })
    try {
      await runEnsAddress('vitalik.eth')
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
    }
  })
})
