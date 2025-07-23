import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as walletService from './wallet.js'

// Mock the Verbs SDK
const mockVerbs = {
  createWallet: vi.fn(),
  getWallet: vi.fn(),
  getAllWallets: vi.fn(),
}

// Mock the getVerbs function
vi.mock('../config/verbs.js', () => ({
  getVerbs: () => mockVerbs,
}))

describe('Wallet Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createWallet', () => {
    it('should create a wallet using the Verbs SDK', async () => {
      const userId = 'test-user'
      const mockWallet = {
        id: 'wallet-123',
        address: '0x1234567890123456789012345678901234567890',
      }

      mockVerbs.createWallet.mockResolvedValue(mockWallet)

      const result = await walletService.createWallet(userId)

      expect(mockVerbs.createWallet).toHaveBeenCalledWith(userId)
      expect(result).toEqual(mockWallet)
    })

    it('should handle wallet creation errors', async () => {
      const userId = 'test-user'
      const error = new Error('Wallet creation failed')

      mockVerbs.createWallet.mockRejectedValue(error)

      await expect(walletService.createWallet(userId)).rejects.toThrow(
        'Wallet creation failed',
      )
    })
  })

  describe('getWallet', () => {
    it('should get a wallet by user ID', async () => {
      const userId = 'test-user'
      const mockWallet = {
        id: 'wallet-123',
        address: '0x1234567890123456789012345678901234567890',
      }

      mockVerbs.getWallet.mockResolvedValue(mockWallet)

      const result = await walletService.getWallet(userId)

      expect(mockVerbs.getWallet).toHaveBeenCalledWith(userId)
      expect(result).toEqual(mockWallet)
    })

    it('should return null if wallet not found', async () => {
      const userId = 'non-existent-user'

      mockVerbs.getWallet.mockResolvedValue(null)

      const result = await walletService.getWallet(userId)

      expect(mockVerbs.getWallet).toHaveBeenCalledWith(userId)
      expect(result).toBeNull()
    })

    it('should handle wallet retrieval errors', async () => {
      const userId = 'test-user'
      const error = new Error('Wallet retrieval failed')

      mockVerbs.getWallet.mockRejectedValue(error)

      await expect(walletService.getWallet(userId)).rejects.toThrow(
        'Wallet retrieval failed',
      )
    })
  })

  describe('getAllWallets', () => {
    it('should get all wallets without options', async () => {
      const mockWallets = [
        {
          id: 'wallet-1',
          address: '0x1234567890123456789012345678901234567890',
        },
        {
          id: 'wallet-2',
          address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        },
      ]

      mockVerbs.getAllWallets.mockResolvedValue(mockWallets)

      const result = await walletService.getAllWallets()

      expect(mockVerbs.getAllWallets).toHaveBeenCalledWith(undefined)
      expect(result).toEqual(mockWallets)
    })

    it('should get all wallets with options', async () => {
      const mockWallets = [
        {
          id: 'wallet-1',
          address: '0x1234567890123456789012345678901234567890',
        },
      ]
      const options = { limit: 1, cursor: 'cursor-123' }

      mockVerbs.getAllWallets.mockResolvedValue(mockWallets)

      const result = await walletService.getAllWallets(options)

      expect(mockVerbs.getAllWallets).toHaveBeenCalledWith(options)
      expect(result).toEqual(mockWallets)
    })

    it('should handle empty wallet list', async () => {
      mockVerbs.getAllWallets.mockResolvedValue([])

      const result = await walletService.getAllWallets()

      expect(result).toEqual([])
    })

    it('should handle getAllWallets errors', async () => {
      const error = new Error('Failed to get all wallets')

      mockVerbs.getAllWallets.mockRejectedValue(error)

      await expect(walletService.getAllWallets()).rejects.toThrow(
        'Failed to get all wallets',
      )
    })
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
      const userId = 'new-user'
      const createError = new Error('Wallet creation failed')

      mockVerbs.getWallet.mockResolvedValue(null)
      mockVerbs.createWallet.mockRejectedValue(createError)

      await expect(walletService.getOrCreateWallet(userId)).rejects.toThrow(
        'Wallet creation failed',
      )

      expect(mockVerbs.getWallet).toHaveBeenCalledWith(userId)
      expect(mockVerbs.createWallet).toHaveBeenCalledWith(userId)
    })

    it('should handle get wallet failure', async () => {
      const userId = 'test-user'
      const getError = new Error('Failed to get wallet')

      mockVerbs.getWallet.mockRejectedValue(getError)

      await expect(walletService.getOrCreateWallet(userId)).rejects.toThrow(
        'Failed to get wallet',
      )

      expect(mockVerbs.getWallet).toHaveBeenCalledWith(userId)
      expect(mockVerbs.createWallet).not.toHaveBeenCalled()
    })
  })
})
