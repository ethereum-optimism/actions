import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetEnvCacheForTests,
  optionalEnv,
  requireEnv,
} from '@/config/env.js'
import { CliError } from '@/output/errors.js'

describe('requireEnv / optionalEnv', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.PRIVATE_KEY
    delete process.env.BASE_SEPOLIA_RPC_URL
    delete process.env.OP_SEPOLIA_RPC_URL
    delete process.env.UNICHAIN_RPC_URL
    __resetEnvCacheForTests()
  })

  afterEach(() => {
    process.env = originalEnv
    __resetEnvCacheForTests()
  })

  it('returns the env var value when present', () => {
    process.env.PRIVATE_KEY = '0xdeadbeef'
    expect(requireEnv('PRIVATE_KEY')).toBe('0xdeadbeef')
  })

  it('throws CliError(config) when the var is missing', () => {
    try {
      requireEnv('PRIVATE_KEY')
      throw new Error('requireEnv did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
      expect((err as CliError).message).toMatch(/PRIVATE_KEY/)
    }
  })

  it('optionalEnv returns undefined for unset vars', () => {
    expect(optionalEnv('BASE_SEPOLIA_RPC_URL')).toBeUndefined()
  })

  it('optionalEnv returns the value when set', () => {
    process.env.BASE_SEPOLIA_RPC_URL = 'https://example.test'
    expect(optionalEnv('BASE_SEPOLIA_RPC_URL')).toBe('https://example.test')
  })
})

const cleanEnvSpy = vi.hoisted(() => vi.fn())

vi.mock('envalid', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('envalid')
  cleanEnvSpy.mockImplementation(actual.cleanEnv as typeof cleanEnvSpy)
  return { ...actual, cleanEnv: cleanEnvSpy }
})

describe('requireEnv (lazy contract)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    cleanEnvSpy.mockClear()
    process.env = { ...originalEnv }
    delete process.env.PRIVATE_KEY
    delete process.env.BASE_SEPOLIA_RPC_URL
    delete process.env.OP_SEPOLIA_RPC_URL
    delete process.env.UNICHAIN_RPC_URL
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('does not call cleanEnv at import time', async () => {
    await import('@/config/env.js')
    expect(cleanEnvSpy).not.toHaveBeenCalled()
  })

  it('calls cleanEnv exactly once across repeated requireEnv invocations', async () => {
    process.env.PRIVATE_KEY = '0xabc'
    const mod = await import('@/config/env.js')
    expect(cleanEnvSpy).not.toHaveBeenCalled()
    mod.requireEnv('PRIVATE_KEY')
    expect(cleanEnvSpy).toHaveBeenCalledTimes(1)
    mod.requireEnv('PRIVATE_KEY')
    mod.optionalEnv('BASE_SEPOLIA_RPC_URL')
    expect(cleanEnvSpy).toHaveBeenCalledTimes(1)
  })
})
