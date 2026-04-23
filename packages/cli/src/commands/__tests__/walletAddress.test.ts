import { privateKeyToAccount } from 'viem/accounts'
import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runWalletAddress } from '@/commands/wallet/address.js'
import { __resetEnvCacheForTests } from '@/config/env.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

const ANVIL_ACCOUNT_0 =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const EXPECTED_ADDRESS = privateKeyToAccount(ANVIL_ACCOUNT_0).address

describe('runWalletAddress', () => {
  const originalEnv = process.env
  let writeSpy: MockInstance

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.PRIVATE_KEY
    __resetEnvCacheForTests()
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    process.env = originalEnv
    __resetEnvCacheForTests()
    vi.restoreAllMocks()
  })

  it('emits the deterministic signer address', async () => {
    process.env.PRIVATE_KEY = ANVIL_ACCOUNT_0
    await runWalletAddress()
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body).toEqual({ address: EXPECTED_ADDRESS })
  })

  it('rejects with CliError(config) when PRIVATE_KEY is missing', async () => {
    try {
      await runWalletAddress()
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
    }
  })

  it('rejects with CliError(config) when PRIVATE_KEY is malformed', async () => {
    process.env.PRIVATE_KEY = 'not-hex'
    try {
      await runWalletAddress()
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
    }
  })
})
