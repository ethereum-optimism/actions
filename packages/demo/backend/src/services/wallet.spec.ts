import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as walletService from './wallet.js'

// Mock the Actions SDK
const mockActions = {
  wallet: {
    hostedWalletProvider: {
      toActionsWallet: vi.fn(),
    },
    smartWalletProvider: {
      getWalletAddress: vi.fn(),
      getWallet: vi.fn(),
    },
    getSmartWallet: vi.fn(),
    createSmartWallet: vi.fn(),
    toActionsWallet: vi.fn(({ address }: { address: string }) => ({
      address,
      signer: {
        address,
      },
    })),
    createSigner: vi.fn(({ address }: { address: string }) => ({
      address,
      type: 'local',
    })),
  },
}
const mockPrivyClient = {
  walletApi: {
    createWallet: vi.fn(),
    getWallet: vi.fn(),
    getWallets: vi.fn(),
  },
}

// Mock the getActions function
vi.mock('../config/actions.js', () => ({
  getActions: () => mockActions,
  getPrivyClient: () => mockPrivyClient,
}))

describe('Wallet Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createWallet', () => {
    it('should create a wallet using the Actions SDK', async () => {
      const mockPrivyWallet = {
        id: 'wallet-123',
        address: '0x1234567890123456789012345678901234567890',
      }
      mockPrivyClient.walletApi.createWallet.mockResolvedValue(mockPrivyWallet)

      const mockWallet = {
        wallet: {
          id: 'wallet-123',
          address: '0x1234567890123456789012345678901234567890',
          signer: {
            address: '0x1234567890123456789012345678901234567890',
          },
          lend: {},
        },
        deployments: [{ chainId: 1, receipt: undefined, success: true }],
      }

      mockActions.wallet.createSmartWallet.mockResolvedValue(mockWallet)

      const result = await walletService.createWallet()

      expect(mockActions.wallet.createSmartWallet).toHaveBeenCalledWith({
        signer: {
          type: 'local',
          address: '0x1234567890123456789012345678901234567890',
        },
      })
      expect(result).toEqual({
        privyAddress: '0x1234567890123456789012345678901234567890',
        smartWalletAddress: '0x1234567890123456789012345678901234567890',
      })
    })

    it('should handle wallet creation errors', async () => {
      const error = new Error('Wallet creation failed')

      mockActions.wallet.createSmartWallet.mockRejectedValue(error)

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
        lend: {},
      }
      const mockPrivyWallet = {
        id: 'wallet-123',
        address: '0x1234567890123456789012345678901234567890',
      }
      mockPrivyClient.walletApi.getWallet.mockResolvedValue(mockPrivyWallet)

      mockActions.wallet.getSmartWallet.mockResolvedValue(mockWallet)

      const result = await walletService.getWallet(userId)

      expect(mockActions.wallet.getSmartWallet).toHaveBeenCalledWith({
        signer: {
          type: 'local',
          address: '0x1234567890123456789012345678901234567890',
        },
        deploymentSigners: ['0x1234567890123456789012345678901234567890'],
      })
      expect(result).toEqual(mockWallet)
    })

    it('should return null if wallet not found', async () => {
      const userId = 'non-existent-user'

      mockPrivyClient.walletApi.getWallet.mockResolvedValue(null)

      const result = await walletService.getWallet(userId)

      expect(mockActions.wallet.getSmartWallet).not.toHaveBeenCalled()
      expect(result).toEqual(null)
    })

    it('should handle wallet retrieval errors', async () => {
      const userId = 'test-user'
      const mockPrivyWallet = {
        id: 'wallet-123',
        address: '0x1234567890123456789012345678901234567890',
      }
      const error = new Error('Wallet retrieval failed')

      mockPrivyClient.walletApi.getWallet.mockResolvedValue(mockPrivyWallet)

      mockActions.wallet.getSmartWallet.mockRejectedValue(error)

      await expect(walletService.getWallet(userId)).rejects.toThrow(
        'Wallet retrieval failed',
      )
    })
  })

  describe('getAllWallets', () => {
    it('should get all wallets without options', async () => {
      const mockPrivyWallets = [
        {
          id: 'wallet-1',
          address: '0x1234567890123456789012345678901234567890',
        },
        {
          id: 'wallet-2',
          address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        },
      ]

      mockPrivyClient.walletApi.getWallets.mockResolvedValue({
        data: mockPrivyWallets,
      })
      mockActions.wallet.getSmartWallet.mockResolvedValue({
        address: '0x1234567890123456789012345678901234567890',
        lend: {},
      })

      const result = await walletService.getAllWallets()

      expect(result).toEqual([
        {
          wallet: {
            address: '0x1234567890123456789012345678901234567890',
            lend: {},
          },
          id: 'wallet-1',
        },
        {
          wallet: {
            address: '0x1234567890123456789012345678901234567890',
            lend: {},
          },
          id: 'wallet-2',
        },
      ])
    })

    it('should get all wallets with options', async () => {
      const mockWallets = [
        {
          id: 'wallet-1',
          address: '0x1234567890123456789012345678901234567890',
          signer: {
            address: '0x1234567890123456789012345678901234567890',
          },
          lend: {},
        },
      ]
      const options = { limit: 1, cursor: 'cursor-123' }

      mockPrivyClient.walletApi.getWallets.mockResolvedValue({
        data: mockWallets,
      })
      mockActions.wallet.getSmartWallet.mockResolvedValue(mockWallets[0])

      const result = await walletService.getAllWallets(options)

      expect(mockPrivyClient.walletApi.getWallets).toHaveBeenCalledWith(options)
      expect(result).toEqual([
        {
          wallet: {
            id: 'wallet-1',
            address: '0x1234567890123456789012345678901234567890',
            signer: {
              address: '0x1234567890123456789012345678901234567890',
            },
            lend: {},
          },
          id: 'wallet-1',
        },
      ])
    })

    it('should handle empty wallet list', async () => {
      mockPrivyClient.walletApi.getWallets.mockResolvedValue({
        data: [],
      })

      const result = await walletService.getAllWallets()

      expect(result).toEqual([])
    })

    it('should handle getAllWallets errors', async () => {
      const error = new Error('Failed to get all wallets')

      mockPrivyClient.walletApi.getWallets.mockRejectedValue(error)

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
        lend: {},
      }

      mockActions.wallet.getSmartWallet.mockResolvedValue(mockWallet)
      mockPrivyClient.walletApi.getWallet.mockResolvedValue({
        id: mockWallet.id,
        address: mockWallet.address,
      })

      const result = await walletService.getBalance(userId)

      expect(mockActions.wallet.getSmartWallet).toHaveBeenCalledWith({
        signer: {
          address: '0x1234567890123456789012345678901234567890',
          type: 'local',
        },
        deploymentSigners: ['0x1234567890123456789012345678901234567890'],
      })
      expect(mockWallet.getBalance).toHaveBeenCalled()
      expect(result).toEqual([
        { symbol: 'USDC', balance: 1000000n },
        { symbol: 'MORPHO', balance: 500000n },
      ])
    })

    it('should throw error when wallet not found', async () => {
      const userId = 'non-existent-user'
      mockPrivyClient.walletApi.getWallet.mockResolvedValue(null)
      mockActions.wallet.getSmartWallet.mockResolvedValue(null)

      await expect(walletService.getBalance(userId)).rejects.toThrow(
        'Wallet not found',
      )

      expect(mockActions.wallet.getSmartWallet).not.toHaveBeenCalledWith()
    })

    it('should handle balance retrieval errors', async () => {
      const userId = 'test-user'
      const balanceError = new Error('Balance retrieval failed')
      const mockWallet = {
        id: 'wallet-123',
        address: '0x1234567890123456789012345678901234567890',
        getBalance: vi.fn().mockRejectedValue(balanceError),
        lend: {},
      }

      mockPrivyClient.walletApi.getWallet.mockResolvedValue({
        id: mockWallet.id,
        address: mockWallet.address,
      })
      mockActions.wallet.getSmartWallet.mockResolvedValue(mockWallet)

      await expect(walletService.getBalance(userId)).rejects.toThrow(
        'Balance retrieval failed',
      )

      expect(mockActions.wallet.getSmartWallet).toHaveBeenCalledWith({
        signer: {
          address: mockWallet.address,
          type: 'local',
        },
        deploymentSigners: [mockWallet.address],
      })
      expect(mockWallet.getBalance).toHaveBeenCalled()
    })
  })
})
