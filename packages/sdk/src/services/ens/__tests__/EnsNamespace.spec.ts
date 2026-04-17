import type { Address, PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { EnsNamespace } from '@/services/ens/EnsNamespace.js'
import { EnsResolutionError, EnsRpcError } from '@/services/ens/errors.js'
import type { EnsName } from '@/services/ens/types.js'

const REAL_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Address
const ENS_NAME = 'vitalik.eth' as EnsName

function mockChainManager(client?: Partial<PublicClient>): ChainManager {
  const tryGetPublicClient = client
    ? vi.fn().mockReturnValue(client)
    : vi.fn().mockReturnValue(undefined)
  return { tryGetPublicClient } as unknown as ChainManager
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
  describe('getAddress', () => {
    it('resolves a hex address directly', async () => {
      const ens = new EnsNamespace(mockChainManager())
      expect(await ens.getAddress(REAL_ADDRESS)).toBe(REAL_ADDRESS)
    })

    it('resolves an ENS name via mainnet client', async () => {
      const client = mockClient()
      const ens = new EnsNamespace(mockChainManager(client))
      expect(await ens.getAddress(ENS_NAME)).toBe(REAL_ADDRESS)
      expect(client.getEnsAddress).toHaveBeenCalledWith({ name: ENS_NAME })
    })

    it('caches resolved addresses on subsequent calls', async () => {
      const client = mockClient()
      const ens = new EnsNamespace(mockChainManager(client))
      await ens.getAddress(ENS_NAME)
      await ens.getAddress(ENS_NAME)
      expect(client.getEnsAddress).toHaveBeenCalledTimes(1)
    })
  })

  describe('getName', () => {
    it('returns ENS name for a known address', async () => {
      const client = mockClient()
      const ens = new EnsNamespace(mockChainManager(client))
      expect(await ens.getName(REAL_ADDRESS)).toBe(ENS_NAME)
      expect(client.getEnsName).toHaveBeenCalledWith({ address: REAL_ADDRESS })
    })

    it('returns null when no primary name is set', async () => {
      const client = mockClient({ getEnsName: vi.fn().mockResolvedValue(null) })
      const ens = new EnsNamespace(mockChainManager(client))
      expect(await ens.getName(REAL_ADDRESS)).toBeNull()
    })

    it('throws EnsRpcError on RPC failure', async () => {
      const client = mockClient({
        getEnsName: vi.fn().mockRejectedValue(new Error('rpc down')),
      })
      const ens = new EnsNamespace(mockChainManager(client))
      await expect(ens.getName(REAL_ADDRESS)).rejects.toThrow(EnsRpcError)
    })

    it('caches results on subsequent calls', async () => {
      const client = mockClient()
      const ens = new EnsNamespace(mockChainManager(client))
      await ens.getName(REAL_ADDRESS)
      await ens.getName(REAL_ADDRESS)
      expect(client.getEnsName).toHaveBeenCalledTimes(1)
    })

    it('caches null results', async () => {
      const client = mockClient({ getEnsName: vi.fn().mockResolvedValue(null) })
      const ens = new EnsNamespace(mockChainManager(client))
      await ens.getName(REAL_ADDRESS)
      await ens.getName(REAL_ADDRESS)
      expect(client.getEnsName).toHaveBeenCalledTimes(1)
    })
  })

  describe('getInfo', () => {
    it('returns all-null EnsInfo when address has no primary name', async () => {
      const client = mockClient({ getEnsName: vi.fn().mockResolvedValue(null) })
      const ens = new EnsNamespace(mockChainManager(client))
      const info = await ens.getInfo(REAL_ADDRESS)
      expect(info).toEqual({
        avatar: null,
        display: null,
        description: null,
        url: null,
        email: null,
        keywords: null,
        twitter: null,
        github: null,
        discord: null,
        reddit: null,
      })
    })

    it('returns all text record fields when name is given', async () => {
      const client = mockClient({
        getEnsText: vi.fn().mockResolvedValue('test-value'),
      })
      const ens = new EnsNamespace(mockChainManager(client))
      const info = await ens.getInfo(ENS_NAME)
      expect(info.avatar).toBe('test-value')
      expect(info.twitter).toBe('test-value')
      expect(info.github).toBe('test-value')
    })

    it('returns null fields when text records are not set', async () => {
      const client = mockClient({ getEnsText: vi.fn().mockResolvedValue(null) })
      const ens = new EnsNamespace(mockChainManager(client))
      const info = await ens.getInfo(ENS_NAME)
      expect(info.avatar).toBeNull()
      expect(info.twitter).toBeNull()
    })

    it('fetches all 10 standard keys in parallel', async () => {
      const client = mockClient({ getEnsText: vi.fn().mockResolvedValue(null) })
      const ens = new EnsNamespace(mockChainManager(client))
      await ens.getInfo(ENS_NAME)
      expect(client.getEnsText).toHaveBeenCalledTimes(10)
    })

    it('throws EnsRpcError on text lookup RPC failure', async () => {
      const client = mockClient({
        getEnsText: vi.fn().mockRejectedValue(new Error('rpc down')),
      })
      const ens = new EnsNamespace(mockChainManager(client))
      await expect(ens.getInfo(ENS_NAME)).rejects.toThrow(EnsRpcError)
    })

    it('throws EnsResolutionError when the resolved name fails normalization', async () => {
      const client = mockClient({
        getEnsName: vi.fn().mockResolvedValue('not!valid.eth'),
      })
      const ens = new EnsNamespace(mockChainManager(client))
      await expect(ens.getInfo(REAL_ADDRESS)).rejects.toThrow(
        EnsResolutionError,
      )
    })

    it('skips reverse resolution when input is already an EnsName', async () => {
      const client = mockClient({ getEnsText: vi.fn().mockResolvedValue(null) })
      const ens = new EnsNamespace(mockChainManager(client))
      await ens.getInfo(ENS_NAME)
      expect(client.getEnsName).not.toHaveBeenCalled()
    })

    it('caches results on subsequent calls', async () => {
      const client = mockClient({ getEnsText: vi.fn().mockResolvedValue(null) })
      const ens = new EnsNamespace(mockChainManager(client))
      await ens.getInfo(ENS_NAME)
      await ens.getInfo(ENS_NAME)
      expect(client.getEnsText).toHaveBeenCalledTimes(10)
    })
  })
})
