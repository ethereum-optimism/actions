import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as walletService from './wallet.js'

// Mock the verbs object before imports
vi.mock('../config/verbs.js', () => ({
  verbs: {
    createWallet: vi.fn(),
    getWallet: vi.fn(),
    getAllWallets: vi.fn(),
  },
}))

describe('Wallet Service', () => {
  let mockVerbs: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const { verbs } = await import('../config/verbs.js')
    mockVerbs = verbs
  })

  describe('getOrCreateWallet', () => {
    it('should return existing wallet if found', async () => {
      const userId = 'test-user'
      const existingWallet = {
        id: 'wallet-123',
        address: '0x1234567890123456789012345678901234567890',
      }

      mockVerbs.getWallet.mockResolvedValue(existingWallet)

      const result = await walletService.getOrCreateWallet(userId)

      expect(mockVerbs.getWallet).toHaveBeenCalledWith(userId)
      expect(mockVerbs.createWallet).not.toHaveBeenCalled()
      expect(result).toEqual(existingWallet)
    })

    it('should create new wallet if not found', async () => {
      const userId = 'new-user'
      const newWallet = {
        id: 'wallet-456',
        address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      }

      mockVerbs.getWallet.mockResolvedValue(null)
      mockVerbs.createWallet.mockResolvedValue(newWallet)

      const result = await walletService.getOrCreateWallet(userId)

      expect(mockVerbs.getWallet).toHaveBeenCalledWith(userId)
      expect(mockVerbs.createWallet).toHaveBeenCalledWith(userId)
      expect(result).toEqual(newWallet)
    })

    it('should handle creation failure after wallet not found', async () => {
      const userId = 'fail-user'
      const error = new Error('Wallet creation failed')

      mockVerbs.getWallet.mockResolvedValue(null)
      mockVerbs.createWallet.mockRejectedValue(error)

      await expect(walletService.getOrCreateWallet(userId)).rejects.toThrow(
        'Wallet creation failed',
      )

      expect(mockVerbs.getWallet).toHaveBeenCalledWith(userId)
      expect(mockVerbs.createWallet).toHaveBeenCalledWith(userId)
    })

    it('should handle get wallet failure', async () => {
      const userId = 'error-user'
      const error = new Error('Failed to get wallet')

      mockVerbs.getWallet.mockRejectedValue(error)

      await expect(walletService.getOrCreateWallet(userId)).rejects.toThrow(
        'Failed to get wallet',
      )

      expect(mockVerbs.getWallet).toHaveBeenCalledWith(userId)
      expect(mockVerbs.createWallet).not.toHaveBeenCalled()
    })
  })

  describe('getBalance', () => {
    it('should return balance when wallet exists', async () => {
      const userId = 'test-user'
      const mockWallet = {
        address: '0x1234567890123456789012345678901234567890',
        getBalance: vi.fn().mockResolvedValue([
          {
            symbol: 'ETH',
            balance: 1000000000000000000n,
          },
        ]),
      }

      mockVerbs.getWallet.mockResolvedValue(mockWallet)

      const result = await walletService.getBalance(userId)

      expect(mockVerbs.getWallet).toHaveBeenCalledWith(userId)
      expect(mockWallet.getBalance).toHaveBeenCalled()
      expect(result).toHaveLength(1)
      expect(result[0].symbol).toBe('ETH')
    })

    it('should throw error when wallet not found', async () => {
      const userId = 'non-existent-user'

      mockVerbs.getWallet.mockResolvedValue(null)

      await expect(walletService.getBalance(userId)).rejects.toThrow(
        'Wallet not found',
      )

      expect(mockVerbs.getWallet).toHaveBeenCalledWith(userId)
    })

    it('should handle balance retrieval errors', async () => {
      const userId = 'error-user'
      const mockWallet = {
        address: '0x1234567890123456789012345678901234567890',
        getBalance: vi
          .fn()
          .mockRejectedValue(new Error('Balance retrieval failed')),
      }

      mockVerbs.getWallet.mockResolvedValue(mockWallet)

      await expect(walletService.getBalance(userId)).rejects.toThrow(
        'Balance retrieval failed',
      )
    })
  })
})
