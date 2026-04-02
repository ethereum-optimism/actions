import type { Address, PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { resolveAddress } from '@/utils/ens.js'

const REAL_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Address
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

function mockClient(
  returnValue: Address | null,
  rejects = false,
): PublicClient {
  const getEnsAddress = rejects
    ? vi.fn().mockRejectedValue(new Error('network error'))
    : vi.fn().mockResolvedValue(returnValue)
  return { getEnsAddress } as unknown as PublicClient
}

describe('resolveAddress', () => {
  describe('hex address input', () => {
    it('returns a valid hex address as-is', async () => {
      expect(await resolveAddress(REAL_ADDRESS)).toBe(REAL_ADDRESS)
    })

    it('does not require a mainnet client for hex addresses', async () => {
      await expect(resolveAddress(REAL_ADDRESS)).resolves.toBe(REAL_ADDRESS)
    })
  })

  describe('ENS name input', () => {
    it('resolves a valid ENS name', async () => {
      const client = mockClient(REAL_ADDRESS)
      const result = await resolveAddress('vitalik.eth', client)
      expect(result).toBe(REAL_ADDRESS)
      expect(client.getEnsAddress).toHaveBeenCalledWith({ name: 'vitalik.eth' })
    })

    it('normalises the ENS name before resolving', async () => {
      const client = mockClient(REAL_ADDRESS)
      await resolveAddress('Vitalik.ETH', client)
      expect(client.getEnsAddress).toHaveBeenCalledWith({ name: 'vitalik.eth' })
    })

    it('throws when no mainnet client is provided', async () => {
      await expect(resolveAddress('vitalik.eth')).rejects.toThrow(
        'ENS resolution requires a mainnet public client',
      )
    })

    it('includes chain ID 1 in the error when no mainnet client provided', async () => {
      await expect(resolveAddress('vitalik.eth')).rejects.toThrow('1')
    })

    it('throws when ENS name cannot be resolved (returns null)', async () => {
      const client = mockClient(null)
      await expect(resolveAddress('unresolvable.eth', client)).rejects.toThrow(
        '"unresolvable.eth" could not be resolved',
      )
    })

    it('throws when ENS name resolves to zero address', async () => {
      const client = mockClient(ZERO_ADDRESS)
      await expect(resolveAddress('zero.eth', client)).rejects.toThrow(
        'zero address',
      )
    })

    it('throws with RPC error label on network failure', async () => {
      const client = mockClient(null, true)
      await expect(resolveAddress('vitalik.eth', client)).rejects.toThrow(
        'RPC error',
      )
    })

    it('preserves the original cause on RPC failure', async () => {
      const client = mockClient(null, true)
      let caught: Error | undefined
      try {
        await resolveAddress('vitalik.eth', client)
      } catch (e) {
        caught = e as Error
      }
      expect(caught?.cause).toBeInstanceOf(Error)
      expect((caught?.cause as Error).message).toBe('network error')
    })
  })

  describe('invalid input', () => {
    it('throws for ENS-shaped strings that fail normalisation', async () => {
      // Has a dot so satisfies EnsName, but contains invalid ENS characters
      await expect(
        resolveAddress('not!valid.eth', {} as PublicClient),
      ).rejects.toThrow('Invalid address or ENS name')
    })

    it('includes the invalid input in the error message', async () => {
      await expect(
        resolveAddress('!!bad!!.eth', {} as PublicClient),
      ).rejects.toThrow('"!!bad!!.eth"')
    })
  })
})
