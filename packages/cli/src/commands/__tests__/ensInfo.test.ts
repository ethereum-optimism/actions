import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MOCK_ADDRESS,
  MOCK_ENS_INFO,
  MOCK_ENS_NAME,
} from '@/__tests__/helpers/ens.js'
import { runEnsInfo } from '@/commands/actions/ens/info.js'
import * as baseCtx from '@/context/baseContext.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

describe('runEnsInfo', () => {
  let writeSpy: MockInstance
  let stderrSpy: MockInstance

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockEns = (
    getInfo: (input: string) => Promise<typeof MOCK_ENS_INFO>,
  ) => {
    vi.spyOn(baseCtx, 'baseContext').mockReturnValue({
      config: { chains: [] } as never,
      actions: { ens: { getInfo } } as never,
    })
  }

  it('emits the SDK EnsInfo shape verbatim for a name', async () => {
    const captured: string[] = []
    const profile = {
      ...MOCK_ENS_INFO,
      display: MOCK_ENS_NAME,
      twitter: 'VitalikButerin',
    }
    mockEns(async (input) => {
      captured.push(input)
      return profile
    })
    await runEnsInfo(MOCK_ENS_NAME)
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body).toEqual(profile)
    expect(captured).toEqual([MOCK_ENS_NAME])
  })

  it('accepts a checksummed address input', async () => {
    const captured: string[] = []
    mockEns(async (input) => {
      captured.push(input)
      return MOCK_ENS_INFO
    })
    await runEnsInfo(MOCK_ADDRESS.toLowerCase())
    expect(captured).toEqual([MOCK_ADDRESS])
  })

  it('rejects an input that is neither name nor address with CliError(validation)', async () => {
    mockEns(async () => MOCK_ENS_INFO)
    try {
      await runEnsInfo('notaname')
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('validates input before calling ENS', async () => {
    const getInfo = vi.fn(async () => MOCK_ENS_INFO)
    mockEns(getInfo)
    try {
      await runEnsInfo('notaname')
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      expect(stderrSpy).not.toHaveBeenCalled()
      expect(getInfo).not.toHaveBeenCalled()
    }
  })

  it('maps RPC failures to CliError(network)', async () => {
    mockEns(async () => {
      throw new Error('fetch failed')
    })
    try {
      await runEnsInfo(MOCK_ENS_NAME)
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
    }
  })
})
