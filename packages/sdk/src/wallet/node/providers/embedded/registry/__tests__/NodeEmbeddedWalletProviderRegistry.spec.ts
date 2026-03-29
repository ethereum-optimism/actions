import type { PrivyClient } from '@privy-io/node'
import type { TurnkeyClient } from '@turnkey/http'
import { unichain } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createMockPrivyClient,
  getMockAuthorizationContext,
} from '@/__mocks__/MockPrivyClient.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { PrivyEmbeddedWalletProvider } from '@/wallet/node/providers/embedded/privy/PrivyEmbeddedWalletProvider.js'
import { NodeEmbeddedWalletProviderRegistry } from '@/wallet/node/providers/embedded/registry/NodeEmbeddedWalletProviderRegistry.js'
import { TurnkeyEmbeddedWalletProvider } from '@/wallet/node/providers/embedded/turnkey/TurnkeyEmbeddedWalletProvider.js'
import type { NodeOptionsMap } from '@/wallet/node/providers/embedded/types/index.js'

describe('NodeEmbeddedWalletProviderRegistry', () => {
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
    const registry = new NodeEmbeddedWalletProviderRegistry()
    const factory = registry.getFactory('privy')

    expect(factory.type).toBe('privy')
    expect(
      factory.validateOptions?.({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
      } as NodeOptionsMap['privy']),
    ).toBe(true)
    expect(
      factory.validateOptions?.({
        privyClient: mockPrivyClient,
      } as NodeOptionsMap['privy']),
    ).toBe(true)
    // Invalid shape should not pass validation
    expect(factory.validateOptions?.({})).toBe(false)
    expect(
      factory.validateOptions?.({
        authorizationContext: getMockAuthorizationContext(),
      } as NodeOptionsMap['privy']),
    ).toBe(false)
  })

  it('creates a PrivyEmbeddedWalletProvider instance', async () => {
    const registry = new NodeEmbeddedWalletProviderRegistry()
    const factory = registry.getFactory('privy')

    const provider = await factory.create({ chainManager: mockChainManager }, {
      privyClient: mockPrivyClient,
      authorizationContext: getMockAuthorizationContext(),
    } as NodeOptionsMap['privy'])

    expect(provider).toBeInstanceOf(PrivyEmbeddedWalletProvider)
  })

  it('returns turnkey factory and validates options', () => {
    const registry = new NodeEmbeddedWalletProviderRegistry()
    const factory = registry.getFactory('turnkey')

    expect(factory.type).toBe('turnkey')
    expect(
      factory.validateOptions?.({
        client: mockTurnkeyClient,
      } as NodeOptionsMap['turnkey']),
    ).toBe(true)
    // Invalid shape should not pass validation
    expect(factory.validateOptions?.({})).toBe(false)
  })

  it('creates a TurnkeyEmbeddedWalletProvider instance', async () => {
    const registry = new NodeEmbeddedWalletProviderRegistry()
    const factory = registry.getFactory('turnkey')

    const provider = await factory.create(
      { chainManager: mockChainManager },
      {
        client: mockTurnkeyClient,
      },
    )

    expect(provider).toBeInstanceOf(TurnkeyEmbeddedWalletProvider)
  })

  it('throws for unknown provider type', () => {
    const registry = new NodeEmbeddedWalletProviderRegistry()
    // @ts-expect-error: testing runtime error for unknown type
    expect(() => registry.getFactory('unknown')).toThrow(
      'Unknown embedded wallet provider: unknown',
    )
  })
})
