import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import {
  base,
  baseSepolia,
  optimism,
  optimismSepolia,
  unichain,
  unichainSepolia,
} from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { CliError } from '@/output/errors.js'
import { resolveChain, shortnameFor } from '@/resolvers/chains.js'

const ALL: SupportedChainId[] = [
  base.id,
  baseSepolia.id,
  optimism.id,
  optimismSepolia.id,
  unichain.id,
  unichainSepolia.id,
]

const SHORTNAMES = [
  'base',
  'base-sepolia',
  'optimism',
  'op-sepolia',
  'unichain',
  'unichain-sepolia',
] as const

describe('resolveChain', () => {
  it('resolves each canonical shortname to its chain id', () => {
    expect(resolveChain('base-sepolia', ALL)).toBe(baseSepolia.id)
    expect(resolveChain('op-sepolia', ALL)).toBe(optimismSepolia.id)
    expect(resolveChain('unichain', ALL)).toBe(unichain.id)
  })

  it('is case-insensitive', () => {
    expect(resolveChain('Base-Sepolia', ALL)).toBe(baseSepolia.id)
    expect(resolveChain('OP-SEPOLIA', ALL)).toBe(optimismSepolia.id)
  })

  it('throws CliError(validation) for unknown shortnames', () => {
    try {
      resolveChain('mars', ALL)
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('rejects shortnames not in the configured chain set', () => {
    try {
      resolveChain('base', [baseSepolia.id])
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })
})

describe('shortnameFor', () => {
  it('returns the canonical shortname for each supported chain id', () => {
    expect(shortnameFor(baseSepolia.id)).toBe('base-sepolia')
    expect(shortnameFor(optimismSepolia.id)).toBe('op-sepolia')
    expect(shortnameFor(unichainSepolia.id)).toBe('unichain-sepolia')
  })
})

describe('resolver round-trip', () => {
  it('shortnameFor(resolveChain(name)) === name for every entry', () => {
    for (const name of SHORTNAMES) {
      expect(shortnameFor(resolveChain(name, ALL))).toBe(name)
    }
  })
})

describe('resolveChainId', () => {
  it('accepts a configured numeric chain id', async () => {
    const { resolveChainId } = await import('@/resolvers/chains.js')
    expect(resolveChainId(String(baseSepolia.id), ALL)).toBe(baseSepolia.id)
  })

  it('rejects non-integers', async () => {
    const { resolveChainId } = await import('@/resolvers/chains.js')
    expect(() => resolveChainId('abc', ALL)).toThrow(CliError)
  })

  it('rejects ids not in the configured set', async () => {
    const { resolveChainId } = await import('@/resolvers/chains.js')
    expect(() => resolveChainId('1', [baseSepolia.id])).toThrow(CliError)
  })
})

describe('resolveChainFlags', () => {
  it('returns undefined when no flag is set', async () => {
    const { resolveChainFlags } = await import('@/resolvers/chains.js')
    expect(resolveChainFlags({}, ALL)).toBeUndefined()
  })

  it('resolves --chain shortname', async () => {
    const { resolveChainFlags } = await import('@/resolvers/chains.js')
    expect(resolveChainFlags({ chain: 'base-sepolia' }, ALL)).toBe(
      baseSepolia.id,
    )
  })

  it('resolves --chain-id numeric', async () => {
    const { resolveChainFlags } = await import('@/resolvers/chains.js')
    expect(
      resolveChainFlags({ chainId: String(optimismSepolia.id) }, ALL),
    ).toBe(optimismSepolia.id)
  })

  it('throws validation when both flags are set', async () => {
    const { resolveChainFlags } = await import('@/resolvers/chains.js')
    try {
      resolveChainFlags(
        { chain: 'base-sepolia', chainId: String(baseSepolia.id) },
        ALL,
      )
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      expect((err as CliError).message).toMatch(/not both/)
    }
  })
})
