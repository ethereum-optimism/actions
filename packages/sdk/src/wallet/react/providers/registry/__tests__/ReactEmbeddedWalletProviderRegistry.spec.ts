import { unichain } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { DynamicEmbeddedWalletProvider } from '@/wallet/react/providers/embedded/dynamic/DynamicEmbeddedWalletProvider.js'
import { PrivyEmbeddedWalletProvider } from '@/wallet/react/providers/embedded/privy/PrivyEmbeddedWalletProvider.js'
import { TurnkeyEmbeddedWalletProvider } from '@/wallet/react/providers/embedded/turnkey/TurnkeyEmbeddedWalletProvider.js'
import type { ReactOptionsMap } from '@/wallet/react/providers/embedded/types/index.js'
import { ReactEmbeddedWalletProviderRegistry } from '@/wallet/react/providers/registry/ReactEmbeddedWalletProviderRegistry.js'

// Mock the dynamic provider to avoid importing any browser-only dependencies
vi.mock(
  '@/wallet/react/providers/embedded/dynamic/DynamicEmbeddedWalletProvider.js',
  async () => {
    const { DynamicEmbeddedWalletProviderMock } =
      await import('@/wallet/react/providers/embedded/dynamic/__mocks__/DynamicEmbeddedWalletProviderMock.js')
    return { DynamicEmbeddedWalletProvider: DynamicEmbeddedWalletProviderMock }
  },
)

// Mock the privy provider to avoid importing any browser-only dependencies
vi.mock(
  '@/wallet/react/providers/embedded/privy/PrivyEmbeddedWalletProvider.js',
  async () => {
    const { PrivyEmbeddedWalletProviderMock } =
      await import('@/wallet/react/providers/embedded/privy/__mocks__/PrivyEmbeddedWalletProviderMock.js')
    return { PrivyEmbeddedWalletProvider: PrivyEmbeddedWalletProviderMock }
  },
)

describe('ReactEmbeddedWalletProviderRegistry', () => {
  const mockChainManager = new MockChainManager({
    supportedChains: [unichain.id],
  }) as unknown as ChainManager

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns dynamic factory and validates options', () => {
    const registry = new ReactEmbeddedWalletProviderRegistry()
    const factory = registry.getFactory('dynamic')

    expect(factory.type).toBe('dynamic')
    // Dynamic options are currently empty; any object should validate to true
    expect(
      factory.validateOptions?.(undefined as ReactOptionsMap['dynamic']),
    ).toBe(true)
  })

  it('creates a DynamicEmbeddedWalletProvider instance', async () => {
    const registry = new ReactEmbeddedWalletProviderRegistry()
    const factory = registry.getFactory('dynamic')

    const provider = await factory.create(
      { chainManager: mockChainManager },
      undefined as ReactOptionsMap['dynamic'],
    )

    expect(provider).toBeInstanceOf(DynamicEmbeddedWalletProvider)
  })

  it('returns privy factory and validates options', () => {
    const registry = new ReactEmbeddedWalletProviderRegistry()
    const factory = registry.getFactory('privy')

    expect(factory.type).toBe('privy')
    expect(
      factory.validateOptions?.(undefined as ReactOptionsMap['privy']),
    ).toBe(true)
  })

  it('creates a PrivyEmbeddedWalletProvider instance', async () => {
    const registry = new ReactEmbeddedWalletProviderRegistry()
    const factory = registry.getFactory('privy')

    const provider = await factory.create(
      { chainManager: mockChainManager },
      undefined as ReactOptionsMap['privy'],
    )

    expect(provider).toBeInstanceOf(PrivyEmbeddedWalletProvider)
  })

  it('returns turnkey factory and validates options', () => {
    const registry = new ReactEmbeddedWalletProviderRegistry()
    const factory = registry.getFactory('turnkey')

    expect(factory.type).toBe('turnkey')
    expect(
      factory.validateOptions?.(undefined as ReactOptionsMap['turnkey']),
    ).toBe(true)
  })

  it('creates a TurnkeyEmbeddedWalletProvider instance', async () => {
    const registry = new ReactEmbeddedWalletProviderRegistry()
    const factory = registry.getFactory('turnkey')

    const provider = await factory.create(
      { chainManager: mockChainManager },
      undefined as ReactOptionsMap['turnkey'],
    )

    expect(provider).toBeInstanceOf(TurnkeyEmbeddedWalletProvider)
  })

  it('throws for unknown provider type', () => {
    const registry = new ReactEmbeddedWalletProviderRegistry()
    // @ts-expect-error: testing runtime error for unknown type
    expect(() => registry.getFactory('unknown')).toThrow(
      'Unknown embedded wallet provider: unknown',
    )
  })
})
