import type { AuthorizationContext, PrivyClient } from '@privy-io/node'
import type { Address } from 'viem'
import { generatePrivateKey } from 'viem/accounts'

import { getRandomAddress } from '@/test/utils.js'

/**
 * Mock Privy Client for testing
 * @description Provides a mock implementation of PrivyClient for testing purposes
 */
export class MockPrivyClient {
  constructor(
    public appId: string,
    public appSecret: string,
  ) {}
}

/**
 * Create a mock Privy client cast as PrivyClient type
 * @param appId - Mock app ID
 * @param appSecret - Mock app secret
 * @returns MockPrivyClient cast as PrivyClient
 */
export function createMockPrivyClient(
  appId: string,
  appSecret: string,
): PrivyClient {
  return new MockPrivyClient(appId, appSecret) as unknown as PrivyClient
}

export function createMockPrivyWallet(params?: {
  id?: string
  address?: Address
}): {
  id: string
  address: Address
} {
  const { id, address } = params ?? {}
  return {
    id: id ?? 'mock-wallet-1',
    address: address ?? getRandomAddress(),
  }
}

export function getMockAuthorizationContext(
  privateKey?: string,
): AuthorizationContext {
  return {
    authorization_private_keys: [privateKey ?? generatePrivateKey()],
  }
}
