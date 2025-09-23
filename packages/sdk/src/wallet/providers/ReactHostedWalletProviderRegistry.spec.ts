import { unichain } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { DynamicHostedWalletProvider } from '@/wallet/providers/DynamicHostedWalletProvider.js'
import type { DynamicOptions } from '@/wallet/providers/hostedProvider.types.js'
import { ReactHostedWalletProviderRegistry } from '@/wallet/providers/ReactHostedWalletProviderRegistry.js'

// Mock the dynamic provider to avoid importing any browser-only dependencies
vi.mock('@/wallet/providers/DynamicHostedWalletProvider.js', async () => {
  const { DynamicHostedWalletProviderMock } = await import(
    '@/test/DynamicHostedWalletProviderMock.js'
  )
  return { DynamicHostedWalletProvider: DynamicHostedWalletProviderMock }
})

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
    expect(factory.validateOptions?.(undefined satisfies DynamicOptions)).toBe(
      true,
    )
  })

  it('creates a DynamicHostedWalletProvider instance', () => {
    const registry = new ReactHostedWalletProviderRegistry()
    const factory = registry.getFactory('dynamic')

    const provider = factory.create(
      { chainManager: mockChainManager },
      undefined as DynamicOptions,
    )

    expect(provider).toBeInstanceOf(DynamicHostedWalletProvider)
  })

  it('throws for unknown provider type', () => {
    const registry = new ReactHostedWalletProviderRegistry()
    // @ts-expect-error: testing runtime error for unknown type
    expect(() => registry.getFactory('unknown')).toThrow(
      'Unknown hosted wallet provider: unknown',
    )
  })
})
