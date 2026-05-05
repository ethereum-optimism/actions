import { privateKeyToAccount } from 'viem/accounts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { __resetEnvCacheForTests } from '@/config/env.js'
import { walletContext } from '@/context/walletContext.js'
import { CliError } from '@/output/errors.js'

const ANVIL_ACCOUNT_0 =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const EXPECTED_ADDRESS = privateKeyToAccount(ANVIL_ACCOUNT_0).address

describe('walletContext', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.PRIVATE_KEY
    __resetEnvCacheForTests()
  })

  afterEach(() => {
    process.env = originalEnv
    __resetEnvCacheForTests()
  })

  it('derives an EOA-backed wallet at the signer address', async () => {
    process.env.PRIVATE_KEY = ANVIL_ACCOUNT_0
    const ctx = await walletContext()
    expect(ctx.signer.address).toBe(EXPECTED_ADDRESS)
    expect(ctx.wallet.address).toBe(EXPECTED_ADDRESS)
  })

  it('produces the same address on repeated calls (pure EOA derivation)', async () => {
    process.env.PRIVATE_KEY = ANVIL_ACCOUNT_0
    const a = await walletContext()
    const b = await walletContext()
    expect(a.wallet.address).toBe(b.wallet.address)
  })

  it('throws CliError(config) when PRIVATE_KEY is missing', async () => {
    try {
      await walletContext()
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
    }
  })

  it('throws CliError(config) when PRIVATE_KEY is malformed', async () => {
    process.env.PRIVATE_KEY = 'not-a-hex-key'
    try {
      await walletContext()
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
      expect((err as CliError).message).toMatch(/PRIVATE_KEY/)
    }
  })
})
