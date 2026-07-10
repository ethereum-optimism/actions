import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MOCK_ADDRESS, MOCK_ENS_NAME } from '@/__tests__/helpers/ens.js'
import { runEnsName } from '@/commands/actions/ens/name.js'
import * as baseCtx from '@/context/baseContext.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

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
      return MOCK_ENS_NAME
    })
    await runEnsName(MOCK_ADDRESS)
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body).toEqual({ address: MOCK_ADDRESS, name: MOCK_ENS_NAME })
    expect(captured).toEqual([MOCK_ADDRESS])
  })

  it('emits name: null when no primary record is set', async () => {
    mockEns(async () => null)
    await runEnsName(MOCK_ADDRESS)
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body).toEqual({ address: MOCK_ADDRESS, name: null })
  })

  it('checksums a lowercased address before forwarding', async () => {
    const captured: string[] = []
    mockEns(async (address) => {
      captured.push(address)
      return null
    })
    await runEnsName(MOCK_ADDRESS.toLowerCase())
    expect(captured).toEqual([MOCK_ADDRESS])
  })

  it('rejects a non-address input with CliError(validation)', async () => {
    mockEns(async () => null)
    try {
      await runEnsName(MOCK_ENS_NAME)
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
      await runEnsName(MOCK_ADDRESS)
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
    }
  })
})
