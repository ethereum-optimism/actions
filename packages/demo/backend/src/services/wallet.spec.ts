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
})
