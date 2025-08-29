import { isAddress } from 'viem'
import { unichain } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { createMockPrivyClient } from '@/test/MockPrivyClient.js'
import { getRandomAddress } from '@/test/utils.js'
import { DefaultSmartWallet } from '@/wallet/DefaultSmartWallet.js'
import { PrivyWallet } from '@/wallet/PrivyWallet.js'
import { DefaultSmartWalletProvider } from '@/wallet/providers/DefaultSmartWalletProvider.js'
import { PrivyEmbeddedWalletProvider } from '@/wallet/providers/PrivyEmbeddedWalletProvider.js'
import { WalletProvider } from '@/wallet/WalletProvider.js'

const mockChainManager = new MockChainManager({
  supportedChains: [unichain.id],
}) as unknown as ChainManager
const mockLendProvider = createMockLendProvider()

describe('WalletProvider', () => {
  it('should create an embedded wallet via provider', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const embeddedWalletProvider = new PrivyEmbeddedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const createWalletSpy = vi.spyOn(embeddedWalletProvider, 'createWallet')
    const walletProvider = new WalletProvider(
      embeddedWalletProvider,
      smartWalletProvider,
    )

    const wallet: PrivyWallet =
      (await walletProvider.createEmbeddedWallet()) as PrivyWallet

    expect(wallet).toBeInstanceOf(PrivyWallet)
    expect(wallet.walletId).toMatch(/^mock-wallet-\d+$/)
    expect(isAddress(wallet.address)).toBe(true)
    expect(createWalletSpy).toHaveBeenCalledOnce()
  })

  it('should create a smart wallet with provided signer and owners', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const embeddedWalletProvider = new PrivyEmbeddedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const createWalletSpy = vi.spyOn(smartWalletProvider, 'createWallet')
    const walletProvider = new WalletProvider(
      embeddedWalletProvider,
      smartWalletProvider,
    )

    // Create an embedded wallet to use as signer
    const embeddedWallet = await embeddedWalletProvider.createWallet()
    const account = await embeddedWallet.account()
    const owners = [getRandomAddress(), embeddedWallet.address]
    const nonce = BigInt(123)

    const smartWallet = await walletProvider.createSmartWallet({
      owners,
      signer: account,
      nonce,
    })

    expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
    expect(smartWallet.signer).toBe(account)
    expect(createWalletSpy).toHaveBeenCalledWith({
      owners,
      signer: account,
      nonce,
    })
  })

  it('should create a wallet with embedded signer (default owners)', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const embeddedWalletProvider = new PrivyEmbeddedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const mockSignerAddress = getRandomAddress()
    const mockEmbeddedWallet = {
      walletId: 'mock-wallet-1',
      address: mockSignerAddress,
      account: async () => {
        return {
          address: mockSignerAddress,
        }
      },
    } as unknown as PrivyWallet
    const embeddedCreateWalletSpy = vi
      .spyOn(embeddedWalletProvider, 'createWallet')
      .mockResolvedValue(mockEmbeddedWallet)
    const smartCreateWalletSpy = vi.spyOn(smartWalletProvider, 'createWallet')
    const walletProvider = new WalletProvider(
      embeddedWalletProvider,
      smartWalletProvider,
    )

    const smartWallet = await walletProvider.createWalletWithEmbeddedSigner()

    expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
    expect(embeddedCreateWalletSpy).toHaveBeenCalledOnce()
    expect(smartCreateWalletSpy).toHaveBeenCalledWith({
      owners: [mockSignerAddress],
      signer: await mockEmbeddedWallet.account(),
      nonce: undefined,
    })
  })

  it('should create a wallet with embedded signer and additional owners', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const embeddedWalletProvider = new PrivyEmbeddedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const mockSignerAddress = getRandomAddress()
    const mockEmbeddedWallet = {
      walletId: 'mock-wallet-1',
      address: mockSignerAddress,
      account: async () => {
        return {
          address: mockSignerAddress,
        }
      },
    } as unknown as PrivyWallet
    const embeddedCreateWalletSpy = vi
      .spyOn(embeddedWalletProvider, 'createWallet')
      .mockResolvedValue(mockEmbeddedWallet)
    const smartCreateWalletSpy = vi.spyOn(smartWalletProvider, 'createWallet')
    const walletProvider = new WalletProvider(
      embeddedWalletProvider,
      smartWalletProvider,
    )

    const additionalOwners = [getRandomAddress(), getRandomAddress()]
    const embeddedWalletIndex = 1
    const nonce = BigInt(456)

    const smartWallet = await walletProvider.createWalletWithEmbeddedSigner({
      owners: additionalOwners,
      embeddedWalletIndex,
      nonce,
    })

    expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
    expect(embeddedCreateWalletSpy).toHaveBeenCalledOnce()
    expect(smartCreateWalletSpy).toHaveBeenCalledWith({
      owners: [additionalOwners[0], mockSignerAddress, additionalOwners[1]],
      signer: await mockEmbeddedWallet.account(),
      nonce,
    })
  })

  it('should create a wallet with embedded signer and additional owners with no specified index', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const embeddedWalletProvider = new PrivyEmbeddedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const mockSignerAddress = getRandomAddress()
    const mockEmbeddedWallet = {
      walletId: 'mock-wallet-1',
      address: mockSignerAddress,
      account: async () => {
        return {
          address: mockSignerAddress,
        }
      },
    } as unknown as PrivyWallet
    const embeddedCreateWalletSpy = vi
      .spyOn(embeddedWalletProvider, 'createWallet')
      .mockResolvedValue(mockEmbeddedWallet)
    const smartCreateWalletSpy = vi.spyOn(smartWalletProvider, 'createWallet')
    const walletProvider = new WalletProvider(
      embeddedWalletProvider,
      smartWalletProvider,
    )

    const additionalOwners = [getRandomAddress(), getRandomAddress()]
    const nonce = BigInt(456)

    const smartWallet = await walletProvider.createWalletWithEmbeddedSigner({
      owners: additionalOwners,
      nonce,
    })

    expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
    expect(embeddedCreateWalletSpy).toHaveBeenCalledOnce()
    expect(smartCreateWalletSpy).toHaveBeenCalledWith({
      owners: [additionalOwners[0], additionalOwners[1], mockSignerAddress],
      signer: await mockEmbeddedWallet.account(),
      nonce,
    })
  })

  it('should get an embedded wallet by ID', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const embeddedWalletProvider = new PrivyEmbeddedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const getWalletSpy = vi.spyOn(embeddedWalletProvider, 'getWallet')
    const walletProvider = new WalletProvider(
      embeddedWalletProvider,
      smartWalletProvider,
    )

    const createdWallet = await embeddedWalletProvider.createWallet()
    const walletId = createdWallet.walletId

    const wallet: PrivyWallet = (await walletProvider.getEmbeddedWallet({
      walletId,
    })) as PrivyWallet

    expect(wallet).toBeInstanceOf(PrivyWallet)
    expect(wallet.walletId).toBe(walletId)
    expect(getWalletSpy).toHaveBeenCalledWith({ walletId })
  })

  it('should get a smart wallet with embedded signer', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const embeddedWalletProvider = new PrivyEmbeddedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const mockSignerAddress = getRandomAddress()
    const mockSigner = {
      address: mockSignerAddress,
    }
    const mockEmbeddedWallet = {
      walletId: 'mock-wallet-1',
      address: mockSignerAddress,
      account: async () => mockSigner,
    } as unknown as PrivyWallet

    const embeddedGetWalletSpy = vi
      .spyOn(embeddedWalletProvider, 'getWallet')
      .mockResolvedValue(mockEmbeddedWallet)
    const smartGetWalletSpy = vi.spyOn(smartWalletProvider, 'getWallet')
    const mockWalletAddress = getRandomAddress()

    vi.spyOn(smartWalletProvider, 'getWalletAddress').mockResolvedValue(
      mockWalletAddress,
    )

    const walletProvider = new WalletProvider(
      embeddedWalletProvider,
      smartWalletProvider,
    )

    const walletId = 'mock-wallet-1'
    const deploymentOwners = [mockSignerAddress]
    const signerOwnerIndex = 0

    const smartWallet = await walletProvider.getSmartWalletWithEmbeddedSigner({
      walletId,
      deploymentOwners,
      signerOwnerIndex,
    })

    expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
    expect(embeddedGetWalletSpy).toHaveBeenCalledWith({ walletId })
    expect(smartGetWalletSpy).toHaveBeenCalledWith({
      walletAddress: mockWalletAddress,
      signer: mockSigner,
      ownerIndex: signerOwnerIndex,
    })
  })

  it('should get a smart wallet with provided signer', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const embeddedWalletProvider = new PrivyEmbeddedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const mockWalletAddress = getRandomAddress()
    const getWalletAddressSpy = vi
      .spyOn(smartWalletProvider, 'getWalletAddress')
      .mockResolvedValue(mockWalletAddress)
    const getWalletSpy = vi.spyOn(smartWalletProvider, 'getWallet')
    const walletProvider = new WalletProvider(
      embeddedWalletProvider,
      smartWalletProvider,
    )

    const embeddedWallet = await embeddedWalletProvider.createWallet()
    const account = await embeddedWallet.account()
    const deploymentOwners = [embeddedWallet.address, getRandomAddress()]
    const signerOwnerIndex = 0
    const nonce = BigInt(789)

    const smartWallet = await walletProvider.getSmartWallet({
      signer: account,
      deploymentOwners,
      signerOwnerIndex,
      nonce,
    })

    expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
    expect(getWalletAddressSpy).toHaveBeenCalledWith({
      owners: deploymentOwners,
      nonce,
    })
    expect(getWalletSpy).toHaveBeenCalledWith({
      walletAddress: mockWalletAddress,
      signer: account,
      ownerIndex: signerOwnerIndex,
    })
  })

  it('should throw error when getting smart wallet without required parameters', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const embeddedWalletProvider = new PrivyEmbeddedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const walletProvider = new WalletProvider(
      embeddedWalletProvider,
      smartWalletProvider,
    )

    const embeddedWallet = await embeddedWalletProvider.createWallet()
    const account = await embeddedWallet.account()

    await expect(
      walletProvider.getSmartWallet({
        signer: account,
        // Missing both walletAddress and deploymentOwners
      }),
    ).rejects.toThrow(
      'Either walletAddress or deploymentOwners array must be provided to locate the smart wallet',
    )
  })

  it('should throw error when embedded wallet is not found', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const embeddedWalletProvider = new PrivyEmbeddedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const walletProvider = new WalletProvider(
      embeddedWalletProvider,
      smartWalletProvider,
    )

    const invalidWalletId = 'invalid-wallet-id'

    await expect(
      walletProvider.getSmartWalletWithEmbeddedSigner({
        walletId: invalidWalletId,
      }),
    ).rejects.toThrow('Failed to get wallet with id: invalid-wallet-id')
  })
})
