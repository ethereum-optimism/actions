import type { Address, PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'

import { EnsNamespace } from './EnsNamespace.js'
import type { EnsName } from './types.js'

const REAL_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Address
const ENS_NAME = 'vitalik.eth'

function mockChainManager(client?: Partial<PublicClient>): ChainManager {
  const getPublicClient = client
    ? vi.fn().mockReturnValue(client)
    : vi.fn().mockImplementation(() => {
        throw new Error('chain not configured')
      })
  return { getPublicClient } as unknown as ChainManager
}

function mockClient(
  overrides: Partial<PublicClient> = {},
): Partial<PublicClient> {
  return {
    getEnsAddress: vi.fn().mockResolvedValue(REAL_ADDRESS),
    getEnsName: vi.fn().mockResolvedValue(ENS_NAME),
    getEnsText: vi.fn().mockResolvedValue(null),
    ...overrides,
  }
}

describe('EnsNamespace', () => {
  describe('resolve', () => {
    it('resolves a hex address directly', async () => {
      const ens = new EnsNamespace(mockChainManager())
      expect(await ens.resolve(REAL_ADDRESS)).toBe(REAL_ADDRESS)
    })

    it('resolves an ENS name via mainnet client', async () => {
      const client = mockClient()
      const ens = new EnsNamespace(mockChainManager(client))
      expect(await ens.resolve(ENS_NAME)).toBe(REAL_ADDRESS)
      expect(client.getEnsAddress).toHaveBeenCalledWith({ name: ENS_NAME })
    })

    it('throws with helpful message when mainnet not configured', async () => {
      const ens = new EnsNamespace(mockChainManager())
      await expect(ens.resolve(ENS_NAME)).rejects.toThrow(
        'ENS resolution requires a mainnet public client',
      )
    })
  })

  describe('reverseResolve', () => {
    it('returns ENS name for a known address', async () => {
      const client = mockClient()
      const ens = new EnsNamespace(mockChainManager(client))
      expect(await ens.reverseResolve(REAL_ADDRESS)).toBe(ENS_NAME)
      expect(client.getEnsName).toHaveBeenCalledWith({ address: REAL_ADDRESS })
    })

    it('returns null when no primary name is set', async () => {
      const client = mockClient({ getEnsName: vi.fn().mockResolvedValue(null) })
      const ens = new EnsNamespace(mockChainManager(client))
      expect(await ens.reverseResolve(REAL_ADDRESS)).toBeNull()
    })

    it('throws with helpful message when mainnet not configured', async () => {
      const ens = new EnsNamespace(mockChainManager())
      await expect(ens.reverseResolve(REAL_ADDRESS)).rejects.toThrow(
        'ENS operations require Ethereum mainnet',
      )
    })

    it('wraps RPC errors with context', async () => {
      const client = mockClient({
        getEnsName: vi.fn().mockRejectedValue(new Error('rpc down')),
      })
      const ens = new EnsNamespace(mockChainManager(client))
      await expect(ens.reverseResolve(REAL_ADDRESS)).rejects.toThrow(
        'RPC error',
      )
    })
  })

  describe('lookupText', () => {
    it('returns null when no primary name is set for address', async () => {
      const client = mockClient({ getEnsName: vi.fn().mockResolvedValue(null) })
      const ens = new EnsNamespace(mockChainManager(client))
      expect(await ens.lookupText(REAL_ADDRESS, 'avatar')).toBeNull()
    })

    it('returns text record value when set', async () => {
      const client = mockClient({
        getEnsText: vi.fn().mockResolvedValue('https://example.com/avatar.png'),
      })
      const ens = new EnsNamespace(mockChainManager(client))
      expect(await ens.lookupText(ENS_NAME, 'avatar')).toBe(
        'https://example.com/avatar.png',
      )
    })

    it('returns null when text record is not set', async () => {
      const client = mockClient({ getEnsText: vi.fn().mockResolvedValue(null) })
      const ens = new EnsNamespace(mockChainManager(client))
      expect(await ens.lookupText(ENS_NAME, 'avatar')).toBeNull()
    })

    it('throws with helpful message when mainnet not configured', async () => {
      const ens = new EnsNamespace(mockChainManager())
      await expect(ens.lookupText(ENS_NAME, 'avatar')).rejects.toThrow(
        'ENS operations require Ethereum mainnet',
      )
    })

    it('wraps RPC errors on text lookup with context', async () => {
      const client = mockClient({
        getEnsText: vi.fn().mockRejectedValue(new Error('rpc down')),
      })
      const ens = new EnsNamespace(mockChainManager(client))
      await expect(ens.lookupText(ENS_NAME, 'avatar')).rejects.toThrow(
        'RPC error',
      )
    })

    it('skips reverse resolution when input is already an EnsName', async () => {
      const client = mockClient({
        getEnsText: vi.fn().mockResolvedValue('https://example.com/avatar.png'),
      })
      const ens = new EnsNamespace(mockChainManager(client))
      await ens.lookupText(ENS_NAME as EnsName, 'avatar')
      expect(client.getEnsName).not.toHaveBeenCalled()
    })
  })
})
