import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import { Wallet } from './index.js'

describe('Wallet', () => {
  const mockAddress: Address = '0x1234567890123456789012345678901234567890'
  const mockId = 'test-wallet-id'

  describe('constructor', () => {
    it('should create a wallet instance with correct properties', () => {
      const wallet = new Wallet(mockId)
      wallet.address = mockAddress

      expect(wallet.id).toBe(mockId)
      expect(wallet.address).toBe(mockAddress)
    })

    it('should initialize with placeholder address', () => {
      const wallet = new Wallet(mockId)

      expect(wallet.id).toBe(mockId)
      expect(wallet.address).toBe('0x')
    })

    it('should handle different wallet IDs', () => {
      const ids = ['wallet-1', 'wallet-2', 'test-id-123']

      ids.forEach((id) => {
        const wallet = new Wallet(id)
        expect(wallet.id).toBe(id)
        expect(wallet.address).toBe('0x')
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
        const wallet = new Wallet(mockId)
        wallet.address = address
        expect(wallet.address).toBe(address)
        expect(wallet.id).toBe(mockId)
      })
    })
  })

  describe('getBalance', () => {
    it('should return 0n as placeholder balance', async () => {
      const wallet = new Wallet(mockId)

      const balance = await wallet.getBalance()

      expect(balance).toBe(0n)
      expect(typeof balance).toBe('bigint')
    })

    it('should return consistent balance across multiple calls', async () => {
      const wallet = new Wallet(mockId)

      const balance1 = await wallet.getBalance()
      const balance2 = await wallet.getBalance()

      expect(balance1).toBe(balance2)
      expect(balance1).toBe(0n)
    })
  })

  describe('type compatibility', () => {
    it('should implement WalletInterface correctly', () => {
      const wallet = new Wallet(mockId)

      // Verify required properties exist
      expect(wallet).toHaveProperty('id')
      expect(wallet).toHaveProperty('address')
      expect(wallet).toHaveProperty('getBalance')

      // Verify types
      expect(typeof wallet.id).toBe('string')
      expect(typeof wallet.address).toBe('string')
      expect(typeof wallet.getBalance).toBe('function')
    })

    it('should have getBalance method that returns a Promise', () => {
      const wallet = new Wallet(mockId)

      const result = wallet.getBalance()
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('edge cases', () => {
    it('should handle empty string id', () => {
      const wallet = new Wallet('')
      expect(wallet.id).toBe('')
      expect(wallet.address).toBe('0x')
    })

    it('should handle very long wallet id', () => {
      const longId = 'a'.repeat(1000)
      const wallet = new Wallet(longId)
      expect(wallet.id).toBe(longId)
      expect(wallet.id.length).toBe(1000)
    })
  })

  describe('immutability', () => {
    it('should maintain property values after creation', () => {
      const wallet = new Wallet(mockId)
      wallet.address = mockAddress

      const originalId = wallet.id
      const originalAddress = wallet.address

      // Properties should remain unchanged
      expect(wallet.id).toBe(originalId)
      expect(wallet.address).toBe(originalAddress)
    })
  })
})
