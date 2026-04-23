import { cleanEnv, str } from 'envalid'

import { CliError } from '@/output/errors.js'

type CliEnv = {
  PRIVATE_KEY: string | undefined
  BASE_SEPOLIA_RPC_URL: string | undefined
  OP_SEPOLIA_RPC_URL: string | undefined
  UNICHAIN_RPC_URL: string | undefined
}

export type CliEnvKey = keyof CliEnv

let cache: CliEnv | undefined

function load(): CliEnv {
  cache ??= cleanEnv(process.env, {
    PRIVATE_KEY: str({ default: undefined }),
    BASE_SEPOLIA_RPC_URL: str({ default: undefined }),
    OP_SEPOLIA_RPC_URL: str({ default: undefined }),
    UNICHAIN_RPC_URL: str({ default: undefined }),
  }) as CliEnv
  return cache
}

/**
 * @description Test-only: resets the lazy env cache so repeated `cleanEnv`
 * invocations can be observed. Production code must never call this — the
 * subprocess model means the cache lives as long as the process.
 */
export function __resetEnvCacheForTests(): void {
  cache = undefined
}

/**
 * @description Lazily reads a required env var through envalid. The first
 * call parses `process.env`; subsequent calls reuse the cached result for
 * the life of the subprocess. Throws `CliError('config')` if the var is not
 * set — `cleanEnv` is never called at module top level, so `actions --help`
 * works with no env configured.
 * @param name - Env var name.
 * @returns The env var value.
 * @throws `CliError` with code `config` when the var is unset or empty.
 */
export function requireEnv(name: CliEnvKey): string {
  const value = load()[name]
  if (!value) {
    throw new CliError('config', `Missing env var: ${name}`)
  }
  return value
}

/**
 * @description Reads an optional env var through envalid. Returns `undefined`
 * if the var is unset; useful for RPC URL overrides that fall back to viem
 * defaults.
 * @param name - Env var name.
 * @returns The env var value, or `undefined`.
 */
export function optionalEnv(name: CliEnvKey): string | undefined {
  return load()[name]
}
