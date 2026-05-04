import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import { base, baseSepolia, optimism, optimismSepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { CliError } from '@/output/errors.js'
import { resolveChain, shortnameFor } from '@/resolvers/chains.js'

const ALL: SupportedChainId[] = [
  base.id,
  baseSepolia.id,
  optimism.id,
  optimismSepolia.id,
]

const SHORTNAMES = ['base', 'base-sepolia', 'optimism', 'op-sepolia'] as const

describe('resolveChain', () => {
  it('resolves each canonical shortname to its chain id', () => {
    expect(resolveChain('base-sepolia', ALL)).toBe(baseSepolia.id)
    expect(resolveChain('op-sepolia', ALL)).toBe(optimismSepolia.id)
    expect(resolveChain('optimism', ALL)).toBe(optimism.id)
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
    expect(shortnameFor(optimism.id)).toBe('optimism')
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

  it('resolves a single --chain shortname into a one-element array', async () => {
    const { resolveChainFlags } = await import('@/resolvers/chains.js')
    expect(resolveChainFlags({ chain: 'base-sepolia' }, ALL)).toEqual([
      baseSepolia.id,
    ])
  })

  it('resolves a single --chain-id numeric into a one-element array', async () => {
    const { resolveChainFlags } = await import('@/resolvers/chains.js')
    expect(
      resolveChainFlags({ chainId: String(optimismSepolia.id) }, ALL),
    ).toEqual([optimismSepolia.id])
  })

  it('resolves comma-separated --chain shortnames preserving order', async () => {
    const { resolveChainFlags } = await import('@/resolvers/chains.js')
    expect(
      resolveChainFlags({ chain: 'base-sepolia,op-sepolia' }, ALL),
    ).toEqual([baseSepolia.id, optimismSepolia.id])
  })

  it('resolves comma-separated --chain-id values preserving order', async () => {
    const { resolveChainFlags } = await import('@/resolvers/chains.js')
    expect(
      resolveChainFlags(
        { chainId: `${baseSepolia.id},${optimism.id}` },
        ALL,
      ),
    ).toEqual([baseSepolia.id, optimism.id])
  })

  it('tolerates whitespace and dedupes within a comma-separated value', async () => {
    const { resolveChainFlags } = await import('@/resolvers/chains.js')
    expect(
      resolveChainFlags(
        { chain: ' base-sepolia , op-sepolia , base-sepolia ' },
        ALL,
      ),
    ).toEqual([baseSepolia.id, optimismSepolia.id])
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

  it('throws validation when the value is empty or only commas', async () => {
    const { resolveChainFlags } = await import('@/resolvers/chains.js')
    expect(() => resolveChainFlags({ chain: ',,' }, ALL)).toThrow(CliError)
  })

  it('throws validation when any element is unknown', async () => {
    const { resolveChainFlags } = await import('@/resolvers/chains.js')
    expect(() =>
      resolveChainFlags({ chain: 'base-sepolia,mars' }, ALL),
    ).toThrow(CliError)
  })
})
