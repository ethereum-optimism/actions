import type { PrivyClient } from '@privy-io/server-auth'
import type { TurnkeyClient } from '@turnkey/http'
import { unichain } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockPrivyClient } from '@/test/MockPrivyClient.js'
import type { PrivyOptions } from '@/wallet/providers/hostedProvider.types.js'
import { NodeHostedWalletProviderRegistry } from '@/wallet/providers/NodeHostedWalletProviderRegistry.js'
import { PrivyHostedWalletProvider } from '@/wallet/providers/PrivyHostedWalletProvider.js'
import { TurnkeyHostedWalletProvider } from '@/wallet/providers/TurnkeyHostedWalletProvider.js'

describe('NodeHostedWalletProviderRegistry', () => {
  const mockChainManager = new MockChainManager({
    supportedChains: [unichain.id],
  }) as unknown as ChainManager
  let mockPrivyClient: PrivyClient
  const mockTurnkeyClient = {} as unknown as TurnkeyClient

  beforeEach(() => {
    mockPrivyClient = createMockPrivyClient('test-app-id', 'test-app-secret')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns privy factory and validates options', () => {
    const registry = new NodeHostedWalletProviderRegistry()
    const factory = registry.getFactory('privy')

    expect(factory.type).toBe('privy')
    expect(factory.validateOptions?.({ privyClient: mockPrivyClient })).toBe(
      true,
    )
    // Invalid shape should not pass validation
    expect(factory.validateOptions?.({})).toBe(false)
  })

  it('creates a PrivyHostedWalletProvider instance', () => {
    const registry = new NodeHostedWalletProviderRegistry()
    const factory = registry.getFactory('privy')

    const provider = factory.create({ chainManager: mockChainManager }, {
      privyClient: mockPrivyClient,
    } satisfies PrivyOptions)

    expect(provider).toBeInstanceOf(PrivyHostedWalletProvider)
  })

  it('returns turnkey factory and validates options', () => {
    const registry = new NodeHostedWalletProviderRegistry()
    const factory = registry.getFactory('turnkey')

    expect(factory.type).toBe('turnkey')
    expect(
      factory.validateOptions?.({
        client: mockTurnkeyClient,
        organizationId: 'org_123',
      }),
    ).toBe(true)
    // Invalid shape should not pass validation
    expect(factory.validateOptions?.({})).toBe(false)
    expect(factory.validateOptions?.({ client: mockTurnkeyClient })).toBe(false)
    expect(factory.validateOptions?.({ organizationId: 'org_123' })).toBe(false)
  })

  it('creates a TurnkeyHostedWalletProvider instance', () => {
    const registry = new NodeHostedWalletProviderRegistry()
    const factory = registry.getFactory('turnkey')

    const provider = factory.create(
      { chainManager: mockChainManager },
      {
        client: mockTurnkeyClient,
        organizationId: 'org_123',
      },
    )

    expect(provider).toBeInstanceOf(TurnkeyHostedWalletProvider)
  })

  it('throws for unknown provider type', () => {
    const registry = new NodeHostedWalletProviderRegistry()
    // @ts-expect-error: testing runtime error for unknown type
    expect(() => registry.getFactory('unknown')).toThrow(
      'Unknown hosted wallet provider: unknown',
    )
  })
})
