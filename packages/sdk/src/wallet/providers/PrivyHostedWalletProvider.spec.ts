import { isAddress } from 'viem'
import { unichain } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { createMockPrivyClient } from '@/test/MockPrivyClient.js'
import { PrivyWallet } from '@/wallet/PrivyWallet.js'
import { PrivyHostedWalletProvider } from '@/wallet/providers/PrivyHostedWalletProvider.js'

const mockChainManager = new MockChainManager({
  supportedChains: [unichain.id],
}) as unknown as ChainManager
const mockLendProvider = createMockLendProvider()

describe('PrivyHostedWalletProvider', () => {
  it('should create a wallet via Privy API', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const createWalletSpy = vi.spyOn(mockPrivyClient.walletApi, 'createWallet')
    const provider = new PrivyHostedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )

    const wallet = await provider.createWallet()

    expect(wallet).toBeInstanceOf(PrivyWallet)
    expect(wallet.walletId).toMatch(/^mock-wallet-\d+$/)
    expect(isAddress(wallet.address)).toBe(true)
    expect(createWalletSpy).toHaveBeenCalledWith({
      chainType: 'ethereum',
    })
  })

  it('should get wallet by ID via Privy API', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const getWalletSpy = vi.spyOn(mockPrivyClient.walletApi, 'getWallet')
    const provider = new PrivyHostedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )

    const createdWallet = await mockPrivyClient.walletApi.createWallet({
      chainType: 'ethereum',
    })
    const wallet = await provider.getWallet({ walletId: createdWallet.id })

    expect(wallet).toBeInstanceOf(PrivyWallet)
    expect(wallet.walletId).toBe(createdWallet.id)
    expect(wallet.address).toBe(createdWallet.address)
    expect(getWalletSpy).toHaveBeenCalledWith({
      id: createdWallet.id,
    })
  })

  it('should get all wallets via Privy API', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const getWalletsSpy = vi.spyOn(mockPrivyClient.walletApi, 'getWallets')
    const provider = new PrivyHostedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )

    await mockPrivyClient.walletApi.createWallet({ chainType: 'ethereum' })
    const wallets = await provider.getAllWallets()

    expect(Array.isArray(wallets)).toBe(true)
    expect(wallets.length).toBe(1)
    expect(getWalletsSpy).toHaveBeenCalledWith({
      limit: undefined,
      cursor: undefined,
    })
  })

  it('should get all wallets with options via Privy API', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )

    const getWalletsSpy = vi.spyOn(mockPrivyClient.walletApi, 'getWallets')

    const provider = new PrivyHostedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const options = { limit: 10, cursor: 'test-cursor' }

    await provider.getAllWallets(options)

    expect(getWalletsSpy).toHaveBeenCalledWith({
      limit: 10,
      cursor: 'test-cursor',
    })
  })

  it('should throw error when getting wallet fails', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const provider = new PrivyHostedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const walletId = 'invalid-wallet-id'

    // This will naturally fail since the wallet doesn't exist
    await expect(provider.getWallet({ walletId })).rejects.toThrow(
      `Failed to get wallet with id: ${walletId}`,
    )
  })
})
