import type { PrivyClient } from '@privy-io/node'
import { unichain } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createMockPrivyClient,
  getMockAuthorizationContext,
} from '@/__mocks__/MockPrivyClient.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { EmbeddedWalletProviderRegistry } from '@/wallet/core/providers/embedded/registry/EmbeddedWalletProviderRegistry.js'
import { PrivyEmbeddedWalletProvider } from '@/wallet/node/providers/embedded/privy/PrivyEmbeddedWalletProvider.js'
import type { NodeOptionsMap } from '@/wallet/node/providers/embedded/types/index.js'

type TestInstanceMap = { privy: PrivyEmbeddedWalletProvider }
class TestEmbeddedWalletProviderRegistry extends EmbeddedWalletProviderRegistry<
  TestInstanceMap,
  Pick<NodeOptionsMap, 'privy'>,
  'privy'
> {
  constructor() {
    super()
    this.register<'privy'>({
      type: 'privy',
      validateOptions(options): options is NodeOptionsMap['privy'] {
        return Boolean((options as NodeOptionsMap['privy'])?.privyClient)
      },
      create({ chainManager }, options) {
        return new PrivyEmbeddedWalletProvider({
          privyClient: options.privyClient,
          chainManager,
          authorizationContext: options.authorizationContext,
        })
      },
    })
  }
}

describe('EmbeddedWalletProviderRegistry', () => {
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
    const registry = new TestEmbeddedWalletProviderRegistry()
    const factory = registry.getFactory('privy')

    expect(factory.type).toBe('privy')
    expect(
      factory.validateOptions?.({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
      }),
    ).toBe(true)
    // Invalid shape should not pass validation
    expect(factory.validateOptions?.({})).toBe(false)
  })

  it('creates a PrivyEmbeddedWalletProvider instance', () => {
    const registry = new TestEmbeddedWalletProviderRegistry()
    const factory = registry.getFactory('privy')

    const provider = factory.create(
      { chainManager: mockChainManager },
      {
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
      },
    )

    expect(provider).toBeInstanceOf(PrivyEmbeddedWalletProvider)
  })

  it('throws for unknown provider type', () => {
    const registry = new TestEmbeddedWalletProviderRegistry()
    // @ts-expect-error: testing runtime error for unknown type
    expect(() => registry.getFactory('unknown')).toThrow(
      'Unknown embedded wallet provider: unknown',
    )
  })
})
