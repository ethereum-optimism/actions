import type { PrivyClient } from '@privy-io/node'
import type { Address } from 'viem'

import { getRandomAddress } from '@/utils/testUtils.js'

/**
 * Mock Privy Client for testing
 * @description Provides a mock implementation of PrivyClient for testing purposes
 */
export class MockPrivyClient {
  public walletApi = {
    createWallet: async (params: { chainType: string }) => {
      const walletId = `mock-wallet-${++this.walletCounter}`
      const address = getRandomAddress()

      const wallet = new MockWallet(walletId, address)
      this.mockWallets.set(walletId, wallet)

      return {
        id: walletId,
        address: address,
        chainType: params.chainType,
      }
    },

    getWallet: async (params: { id: string }) => {
      const wallet = this.mockWallets.get(params.id)
      if (!wallet) {
        throw new Error(`Wallet ${params.id} not found`)
      }

      return {
        id: wallet.id,
        address: wallet.address,
        chainType: 'ethereum',
      }
    },

    getWallets: async (params?: { limit?: number; cursor?: string }) => {
      const wallets = Array.from(this.mockWallets.values())
      const limit = params?.limit || wallets.length

      return {
        data: wallets.slice(0, limit).map((wallet) => ({
          id: wallet.id,
          address: wallet.address,
          chainType: 'ethereum',
        })),
      }
    },

    ethereum: {
      signMessage: async (params: { walletId: string; message: string }) => {
        const wallet = this.mockWallets.get(params.walletId)
        if (!wallet) {
          throw new Error(`Wallet ${params.walletId} not found`)
        }

        // Mock signature - deterministic based on message
        const mockSig = `0x${'a'.repeat(128)}${params.message.length.toString(16).padStart(2, '0')}`
        return { signature: mockSig }
      },

      secp256k1Sign: async (params: { walletId: string; hash: string }) => {
        const wallet = this.mockWallets.get(params.walletId)
        if (!wallet) {
          throw new Error(`Wallet ${params.walletId} not found`)
        }

        // Mock signature - deterministic based on hash
        const mockSig = `0x${'b'.repeat(128)}${params.hash.slice(-2)}`
        return { signature: mockSig }
      },

      signTransaction: async (params: {
        walletId: string
        transaction: unknown
      }) => {
        const wallet = this.mockWallets.get(params.walletId)
        if (!wallet) {
          throw new Error(`Wallet ${params.walletId} not found`)
        }

        // Mock signed transaction
        const mockSignedTx = `0x${'c'.repeat(200)}`
        return { signedTransaction: mockSignedTx }
      },
    },
  }

  private mockWallets = new Map<string, MockWallet>()
  private walletCounter = 0

  constructor(
    public appId: string,
    public appSecret: string,
  ) {}
}

class MockWallet {
  constructor(
    public id: string,
    public address: Address,
  ) {}
}

/**
 * Create a mock Privy client cast as PrivyClient type
 * @param appId - Mock app ID
 * @param appSecret - Mock app secret
 * @returns MockPrivyClient cast as PrivyClient
 */
export function createMockPrivyClient(
  appId: string,
  appSecret: string,
): PrivyClient {
  return new MockPrivyClient(appId, appSecret) as unknown as PrivyClient
}
