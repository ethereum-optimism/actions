import type { PrivyClient } from '@privy-io/server-auth'
import { unichain } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockPrivyClient } from '@/test/MockPrivyClient.js'
import { HostedWalletProviderRegistry } from '@/wallet/core/providers/hosted/registry/HostedWalletProviderRegistry.js'
import type { PrivyOptions } from '@/wallet/core/providers/hosted/types/index.js'
import { PrivyHostedWalletProvider } from '@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js'

class TestHostedWalletProviderRegistry extends HostedWalletProviderRegistry {
  constructor() {
    super()
    this.register<'privy'>({
      type: 'privy',
      validateOptions(options): options is PrivyOptions {
        return Boolean((options as PrivyOptions)?.privyClient)
      },
      create({ chainManager }, options) {
        return new PrivyHostedWalletProvider(options.privyClient, chainManager)
      },
    })
  }
}

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
    const registry = new TestHostedWalletProviderRegistry()
    const factory = registry.getFactory('privy')

    expect(factory.type).toBe('privy')
    expect(factory.validateOptions?.({ privyClient: mockPrivyClient })).toBe(
      true,
    )
    // Invalid shape should not pass validation
    expect(factory.validateOptions?.({})).toBe(false)
  })

  it('creates a PrivyHostedWalletProvider instance', () => {
    const registry = new TestHostedWalletProviderRegistry()
    const factory = registry.getFactory('privy')

    const provider = factory.create(
      { chainManager: mockChainManager },
      { privyClient: mockPrivyClient },
    )

    expect(provider).toBeInstanceOf(PrivyHostedWalletProvider)
  })

  it('throws for unknown provider type', () => {
    const registry = new TestHostedWalletProviderRegistry()
    // @ts-expect-error: testing runtime error for unknown type
    expect(() => registry.getFactory('unknown')).toThrow(
      'Unknown hosted wallet provider: unknown',
    )
  })
})
