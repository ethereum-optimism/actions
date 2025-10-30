import type { PrivyClient } from '@privy-io/node'
import { unichain } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import {
  createMockPrivyClient,
  getMockAuthorizationContext,
} from '@/test/MockPrivyClient.js'
import { HostedWalletProviderRegistry } from '@/wallet/core/providers/hosted/registry/HostedWalletProviderRegistry.js'
import { PrivyHostedWalletProvider } from '@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js'
import type { NodeOptionsMap } from '@/wallet/node/providers/hosted/types/index.js'

type TestInstanceMap = { privy: PrivyHostedWalletProvider }
class TestHostedWalletProviderRegistry extends HostedWalletProviderRegistry<
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
        return new PrivyHostedWalletProvider({
          privyClient: options.privyClient,
          chainManager,
          authorizationContext: options.authorizationContext,
        })
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
    expect(
      factory.validateOptions?.({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
      }),
    ).toBe(true)
    // Invalid shape should not pass validation
    expect(factory.validateOptions?.({})).toBe(false)
  })

  it('creates a PrivyHostedWalletProvider instance', () => {
    const registry = new TestHostedWalletProviderRegistry()
    const factory = registry.getFactory('privy')

    const provider = factory.create(
      { chainManager: mockChainManager },
      {
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
      },
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
