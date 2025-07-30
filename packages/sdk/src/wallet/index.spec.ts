import type { Address } from 'viem'
import { unichain } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import type { LendProvider } from '@/types/lend.js'
import type { VerbsInterface } from '@/types/verbs.js'
import { Wallet } from '@/wallet/index.js'

describe('Wallet', () => {
  const mockAddress: Address = '0x1234567890123456789012345678901234567890'
  const mockId = 'test-wallet-id'
  const chainManager: ChainManager = new MockChainManager({
    supportedChains: [unichain.id],
    defaultBalance: 1000000n,
  }) as any

  // Mock Verbs instance
  const mockVerbs: VerbsInterface = {
    get chainManager() { return chainManager },
    get lend(): LendProvider { throw new Error('Lend provider not configured') },
    createWallet: async () => { throw new Error('Not implemented') },
    getWallet: async () => { throw new Error('Not implemented') },
    getAllWallets: async () => { throw new Error('Not implemented') },
  } as VerbsInterface

  describe('constructor', () => {
    it('should create a wallet instance with correct properties', () => {
      const wallet = new Wallet(mockId, mockVerbs)
      wallet.init(mockAddress)

      expect(wallet.id).toBe(mockId)
      expect(wallet.address).toBe(mockAddress)
    })

    it('should handle different wallet IDs', () => {
      const ids = ['wallet-1', 'wallet-2', 'test-id-123']

      ids.forEach((id) => {
        const wallet = new Wallet(id, mockVerbs)
        expect(wallet.id).toBe(id)
      })
    })
  })

  describe('address assignment', () => {
    it('should allow setting address after creation', () => {
      const addresses: Address[] = [
        '0x0000000000000000000000000000000000000000',
        '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
        '0x742d35Cc6634C0532925a3b8C17Eb02c7b2BD8eB',
      ]

      addresses.forEach((address) => {
        const wallet = new Wallet(mockId, mockVerbs)
        wallet.init(address)
        expect(wallet.address).toBe(address)
        expect(wallet.id).toBe(mockId)
      })
    })
  })

  describe('getBalance', () => {
    it('should return token balances', async () => {
      const wallet = new Wallet(mockId, mockVerbs)
      wallet.init(mockAddress)

      const balance = await wallet.getBalance()

      expect(balance).toEqual([
        {
          totalBalance: 1000000n,
          symbol: 'USDC',
          chainBalances: [
            {
              balance: 1000000n,
              chainId: 130,
            },
          ],
        },
        {
          totalBalance: 0n,
          symbol: 'MORPHO',
          chainBalances: [],
        },
      ])
    })

    it('should throw an error if the wallet is not initialized', async () => {
      const wallet = new Wallet(mockId, mockVerbs)
      await expect(wallet.getBalance()).rejects.toThrow(
        'Wallet not initialized',
      )
    })
  })

  describe('edge cases', () => {
    it('should handle empty string id', () => {
      const wallet = new Wallet('', mockVerbs)
      expect(wallet.id).toBe('')
      expect(wallet.address).toBeUndefined()
    })

    it('should handle very long wallet id', () => {
      const longId = 'a'.repeat(1000)
      const wallet = new Wallet(longId, mockVerbs)
      expect(wallet.id).toBe(longId)
      expect(wallet.id.length).toBe(1000)
    })
  })

  describe('immutability', () => {
    it('should maintain property values after creation', () => {
      const wallet = new Wallet(mockId, mockVerbs)
      wallet.address = mockAddress

      const originalId = wallet.id
      const originalAddress = wallet.address

      // Properties should remain unchanged
      expect(wallet.id).toBe(originalId)
      expect(wallet.address).toBe(originalAddress)
    })
  })
})
