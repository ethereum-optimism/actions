import { unichain } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { DynamicHostedWalletProvider } from '@/wallet/react/providers/hosted/dynamic/DynamicHostedWalletProvider.js'
import { PrivyHostedWalletProvider } from '@/wallet/react/providers/hosted/privy/PrivyHostedWalletProvider.js'
import type { ReactOptionsMap } from '@/wallet/react/providers/hosted/types/index.js'
import { ReactHostedWalletProviderRegistry } from '@/wallet/react/providers/registry/ReactHostedWalletProviderRegistry.js'

// Mock the dynamic provider to avoid importing any browser-only dependencies
vi.mock(
  '@/wallet/react/providers/hosted/dynamic/DynamicHostedWalletProvider.js',
  async () => {
    const { DynamicHostedWalletProviderMock } = await import(
      '@/wallet/react/providers/hosted/dynamic/__mocks__/DynamicHostedWalletProviderMock.js'
    )
    return { DynamicHostedWalletProvider: DynamicHostedWalletProviderMock }
  },
)

// Mock the privy provider to avoid importing any browser-only dependencies
vi.mock(
  '@/wallet/react/providers/hosted/privy/PrivyHostedWalletProvider.js',
  async () => {
    const { PrivyHostedWalletProviderMock } = await import(
      '@/wallet/react/providers/hosted/privy/__mocks__/PrivyHostedWalletProviderMock.js'
    )
    return { PrivyHostedWalletProvider: PrivyHostedWalletProviderMock }
  },
)

describe('ReactHostedWalletProviderRegistry', () => {
  const mockChainManager = new MockChainManager({
    supportedChains: [unichain.id],
  }) as unknown as ChainManager

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns dynamic factory and validates options', () => {
    const registry = new ReactHostedWalletProviderRegistry()
    const factory = registry.getFactory('dynamic')

    expect(factory.type).toBe('dynamic')
    // Dynamic options are currently empty; any object should validate to true
    expect(
      factory.validateOptions?.(undefined as ReactOptionsMap['dynamic']),
    ).toBe(true)
  })

  it('creates a DynamicHostedWalletProvider instance', () => {
    const registry = new ReactHostedWalletProviderRegistry()
    const factory = registry.getFactory('dynamic')

    const provider = factory.create(
      { chainManager: mockChainManager },
      undefined as ReactOptionsMap['dynamic'],
    )

    expect(provider).toBeInstanceOf(DynamicHostedWalletProvider)
  })

  it('returns privy factory and validates options', () => {
    const registry = new ReactHostedWalletProviderRegistry()
    const factory = registry.getFactory('privy')

    expect(factory.type).toBe('privy')
    expect(
      factory.validateOptions?.(undefined as ReactOptionsMap['privy']),
    ).toBe(true)
  })

  it('creates a PrivyHostedWalletProvider instance', () => {
    const registry = new ReactHostedWalletProviderRegistry()
    const factory = registry.getFactory('privy')

    const provider = factory.create(
      { chainManager: mockChainManager },
      undefined as ReactOptionsMap['privy'],
    )

    expect(provider).toBeInstanceOf(PrivyHostedWalletProvider)
  })

  it('throws for unknown provider type', () => {
    const registry = new ReactHostedWalletProviderRegistry()
    // @ts-expect-error: testing runtime error for unknown type
    expect(() => registry.getFactory('unknown')).toThrow(
      'Unknown hosted wallet provider: unknown',
    )
  })
})
