import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as walletService from './wallet.js'

// Mock the Verbs SDK
const mockVerbs = {
  wallet: {
    embeddedWalletProvider: {
      getAllWallets: vi.fn(),
    },
    smartWalletProvider: {
      getWalletAddress: vi.fn(),
      getWallet: vi.fn(),
    },
    getSmartWallet: vi.fn(),
    getEmbeddedWallet: vi.fn(),
    getSmartWalletWithEmbeddedSigner: vi.fn(),
    createWalletWithEmbeddedSigner: vi.fn(),
    createSmartWallet: vi.fn(),
    createEmbeddedWallet: vi.fn(),
  },
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
      const mockWallet = {
        id: 'wallet-123',
        getAddress: vi
          .fn()
          .mockResolvedValue('0x1234567890123456789012345678901234567890'),
        signer: {
          address: '0x1234567890123456789012345678901234567890',
        },
      }

      mockVerbs.wallet.createWalletWithEmbeddedSigner.mockResolvedValue(
        mockWallet,
      )

      const result = await walletService.createWallet()

      expect(
        mockVerbs.wallet.createWalletWithEmbeddedSigner,
      ).toHaveBeenCalledWith()
      expect(result).toEqual({
        privyAddress: '0x1234567890123456789012345678901234567890',
        smartWalletAddress: '0x1234567890123456789012345678901234567890',
      })
    })

    it('should handle wallet creation errors', async () => {
      const error = new Error('Wallet creation failed')

      mockVerbs.wallet.createWalletWithEmbeddedSigner.mockRejectedValue(error)

      await expect(walletService.createWallet()).rejects.toThrow(
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

      mockVerbs.wallet.getSmartWalletWithEmbeddedSigner.mockResolvedValue(
        mockWallet,
      )

      const result = await walletService.getWallet(userId)

      expect(
        mockVerbs.wallet.getSmartWalletWithEmbeddedSigner,
      ).toHaveBeenCalledWith({
        walletId: userId,
      })
      expect(result).toEqual({ wallet: mockWallet })
    })

    it('should return null if wallet not found', async () => {
      const userId = 'non-existent-user'

      mockVerbs.wallet.getSmartWalletWithEmbeddedSigner.mockResolvedValue(null)

      const result = await walletService.getWallet(userId)

      expect(
        mockVerbs.wallet.getSmartWalletWithEmbeddedSigner,
      ).toHaveBeenCalledWith({
        walletId: userId,
      })
      expect(result).toEqual({ wallet: null })
    })

    it('should handle wallet retrieval errors', async () => {
      const userId = 'test-user'
      const error = new Error('Wallet retrieval failed')

      mockVerbs.wallet.getSmartWalletWithEmbeddedSigner.mockRejectedValue(error)

      await expect(walletService.getWallet(userId)).rejects.toThrow(
        'Wallet retrieval failed',
      )
    })
  })

  describe('getAllWallets', () => {
    it('should get all wallets without options', async () => {
      const mockPrivyWallets = [
        {
          walletId: 'wallet-1',
          address: '0x1234567890123456789012345678901234567890',
          signer: vi.fn().mockResolvedValue({
            address: '0x1234567890123456789012345678901234567890',
          }),
        },
        {
          walletId: 'wallet-2',
          address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          signer: vi.fn().mockResolvedValue({
            address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          }),
        },
      ]

      mockVerbs.wallet.embeddedWalletProvider.getAllWallets.mockResolvedValue(
        mockPrivyWallets,
      )
      mockVerbs.wallet.smartWalletProvider.getWalletAddress.mockResolvedValue(
        '0x1234567890123456789012345678901234567890',
      )
      mockVerbs.wallet.smartWalletProvider.getWallet.mockReturnValue({
        address: '0x1234567890123456789012345678901234567890',
      })

      const result = await walletService.getAllWallets()

      expect(
        mockVerbs.wallet.embeddedWalletProvider.getAllWallets,
      ).toHaveBeenCalledWith(undefined)
      expect(result).toEqual([
        {
          wallet: {
            address: '0x1234567890123456789012345678901234567890',
          },
          id: 'wallet-1',
        },
        {
          wallet: {
            address: '0x1234567890123456789012345678901234567890',
          },
          id: 'wallet-2',
        },
      ])
    })

    it('should get all wallets with options', async () => {
      const mockWallets = [
        {
          walletId: 'wallet-1',
          address: '0x1234567890123456789012345678901234567890',
          signer: vi.fn().mockResolvedValue({
            address: '0x1234567890123456789012345678901234567890',
          }),
        },
      ]
      const options = { limit: 1, cursor: 'cursor-123' }

      mockVerbs.wallet.embeddedWalletProvider.getAllWallets.mockResolvedValue(
        mockWallets,
      )
      mockVerbs.wallet.smartWalletProvider.getWalletAddress.mockResolvedValue(
        '0x1234567890123456789012345678901234567890',
      )
      mockVerbs.wallet.smartWalletProvider.getWallet.mockReturnValue({
        address: '0x1234567890123456789012345678901234567890',
      })

      const result = await walletService.getAllWallets(options)

      expect(
        mockVerbs.wallet.embeddedWalletProvider.getAllWallets,
      ).toHaveBeenCalledWith(options)
      expect(result).toEqual([
        {
          wallet: {
            address: '0x1234567890123456789012345678901234567890',
          },
          id: 'wallet-1',
        },
      ])
    })

    it('should handle empty wallet list', async () => {
      mockVerbs.wallet.embeddedWalletProvider.getAllWallets.mockResolvedValue(
        [],
      )

      const result = await walletService.getAllWallets()

      expect(result).toEqual([])
    })

    it('should handle getAllWallets errors', async () => {
      const error = new Error('Failed to get all wallets')

      mockVerbs.wallet.embeddedWalletProvider.getAllWallets.mockRejectedValue(
        error,
      )

      await expect(walletService.getAllWallets()).rejects.toThrow(
        'Failed to get all wallets',
      )
    })
  })

  describe('getBalance', () => {
    it('should return balance when wallet exists', async () => {
      const userId = 'test-user'
      const mockWallet = {
        id: 'wallet-123',
        address: '0x1234567890123456789012345678901234567890',
        getBalance: vi.fn().mockResolvedValue([
          { symbol: 'USDC', balance: 1000000n },
          { symbol: 'MORPHO', balance: 500000n },
        ]),
      }

      mockVerbs.wallet.getSmartWalletWithEmbeddedSigner.mockResolvedValue(
        mockWallet,
      )

      const result = await walletService.getBalance(userId)

      expect(
        mockVerbs.wallet.getSmartWalletWithEmbeddedSigner,
      ).toHaveBeenCalledWith({
        walletId: userId,
      })
      expect(mockWallet.getBalance).toHaveBeenCalled()
      expect(result).toEqual([
        { symbol: 'USDC', balance: 1000000n },
        { symbol: 'MORPHO', balance: 500000n },
      ])
    })

    it('should throw error when wallet not found', async () => {
      const userId = 'non-existent-user'

      mockVerbs.wallet.getSmartWalletWithEmbeddedSigner.mockResolvedValue(null)

      await expect(walletService.getBalance(userId)).rejects.toThrow(
        'Wallet not found',
      )

      expect(
        mockVerbs.wallet.getSmartWalletWithEmbeddedSigner,
      ).toHaveBeenCalledWith({
        walletId: userId,
      })
    })

    it('should handle balance retrieval errors', async () => {
      const userId = 'test-user'
      const balanceError = new Error('Balance retrieval failed')
      const mockWallet = {
        id: 'wallet-123',
        address: '0x1234567890123456789012345678901234567890',
        getBalance: vi.fn().mockRejectedValue(balanceError),
      }

      mockVerbs.wallet.getSmartWalletWithEmbeddedSigner.mockResolvedValue(
        mockWallet,
      )

      await expect(walletService.getBalance(userId)).rejects.toThrow(
        'Balance retrieval failed',
      )

      expect(
        mockVerbs.wallet.getSmartWalletWithEmbeddedSigner,
      ).toHaveBeenCalledWith({
        walletId: userId,
      })
      expect(mockWallet.getBalance).toHaveBeenCalled()
    })
  })
})
