import type { PrivyClient } from '@privy-io/server-auth'
import { unichain } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockPrivyClient } from '@/test/MockPrivyClient.js'
import { HostedWalletProviderRegistry } from '@/wallet/providers/HostedWalletProviderRegistry.js'
import { PrivyHostedWalletProvider } from '@/wallet/providers/PrivyHostedWalletProvider.js'

describe('HostedWalletProviderRegistry', () => {
  const mockChainManager = new MockChainManager({
    supportedChains: [unichain.id],
  }) as unknown as ChainManager
  let mockPrivyClient: PrivyClient

  beforeEach(() => {
    mockPrivyClient = createMockPrivyClient('test-app-id', 'test-app-secret')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns privy factory and validates options', () => {
    const registry = new HostedWalletProviderRegistry()
    const factory = registry.getFactory('privy')

    expect(factory.type).toBe('privy')
    expect(factory.validateOptions?.({ privyClient: mockPrivyClient })).toBe(
      true,
    )
    // Invalid shape should not pass validation
    expect(factory.validateOptions?.({})).toBe(false)
  })

  it('creates a PrivyHostedWalletProvider instance', () => {
    const registry = new HostedWalletProviderRegistry()
    const factory = registry.getFactory('privy')

    const provider = factory.create(
      { chainManager: mockChainManager },
      { privyClient: mockPrivyClient },
    )

    expect(provider).toBeInstanceOf(PrivyHostedWalletProvider)
  })

  it('throws for unknown provider type', () => {
    const registry = new HostedWalletProviderRegistry()
    // @ts-expect-error: testing runtime error for unknown type
    expect(() => registry.getFactory('unknown')).toThrow(
      'Unknown hosted wallet provider: unknown',
    )
  })
})
