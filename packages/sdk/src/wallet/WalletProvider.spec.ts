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
import { PrivyHostedWalletProvider } from '@/wallet/providers/PrivyHostedWalletProvider.js'
import { WalletProvider } from '@/wallet/WalletProvider.js'

const mockChainManager = new MockChainManager({
  supportedChains: [unichain.id],
}) as unknown as ChainManager
const mockLendProvider = createMockLendProvider()

describe('WalletProvider', () => {
  it('should create a hosted wallet via provider', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const hostedWalletProvider = new PrivyHostedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const createWalletSpy = vi.spyOn(hostedWalletProvider, 'createWallet')
    const walletProvider = new WalletProvider(
      hostedWalletProvider,
      smartWalletProvider,
    )

    const wallet: PrivyWallet =
      (await walletProvider.createHostedWallet()) as PrivyWallet

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
    const hostedWalletProvider = new PrivyHostedWalletProvider(
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
      hostedWalletProvider,
      smartWalletProvider,
    )

    // Create a hosted wallet to use as signer
    const hostedWallet = await hostedWalletProvider.createWallet()
    const account = await hostedWallet.account()
    const owners = [getRandomAddress(), hostedWallet.address]
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

  it('should create a wallet with hosted signer (default owners)', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const hostedWalletProvider = new PrivyHostedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const mockSignerAddress = getRandomAddress()
    const mockHostedWallet = {
      walletId: 'mock-wallet-1',
      address: mockSignerAddress,
      account: async () => {
        return {
          address: mockSignerAddress,
        }
      },
    } as unknown as PrivyWallet
    const hostedCreateWalletSpy = vi
      .spyOn(hostedWalletProvider, 'createWallet')
      .mockResolvedValue(mockHostedWallet)
    const smartCreateWalletSpy = vi.spyOn(smartWalletProvider, 'createWallet')
    const walletProvider = new WalletProvider(
      hostedWalletProvider,
      smartWalletProvider,
    )

    const smartWallet = await walletProvider.createWalletWithHostedSigner()

    expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
    expect(hostedCreateWalletSpy).toHaveBeenCalledOnce()
    expect(smartCreateWalletSpy).toHaveBeenCalledWith({
      owners: [mockSignerAddress],
      signer: await mockHostedWallet.account(),
      nonce: undefined,
    })
  })

  it('should create a wallet with hosted signer and additional owners', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const hostedWalletProvider = new PrivyHostedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const mockSignerAddress = getRandomAddress()
    const mockHostedWallet = {
      walletId: 'mock-wallet-1',
      address: mockSignerAddress,
      account: async () => {
        return {
          address: mockSignerAddress,
        }
      },
    } as unknown as PrivyWallet
    const hostedCreateWalletSpy = vi
      .spyOn(hostedWalletProvider, 'createWallet')
      .mockResolvedValue(mockHostedWallet)
    const smartCreateWalletSpy = vi.spyOn(smartWalletProvider, 'createWallet')
    const walletProvider = new WalletProvider(
      hostedWalletProvider,
      smartWalletProvider,
    )

    const additionalOwners = [getRandomAddress(), getRandomAddress()]
    const hostedWalletIndex = 1
    const nonce = BigInt(456)

    const smartWallet = await walletProvider.createWalletWithHostedSigner({
      owners: additionalOwners,
      hostedWalletIndex,
      nonce,
    })

    expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
    expect(hostedCreateWalletSpy).toHaveBeenCalledOnce()
    expect(smartCreateWalletSpy).toHaveBeenCalledWith({
      owners: [additionalOwners[0], mockSignerAddress, additionalOwners[1]],
      signer: await mockHostedWallet.account(),
      nonce,
    })
  })

  it('should create a wallet with hosted signer and additional owners with no specified index', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const hostedWalletProvider = new PrivyHostedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const mockSignerAddress = getRandomAddress()
    const mockHostedWallet = {
      walletId: 'mock-wallet-1',
      address: mockSignerAddress,
      account: async () => {
        return {
          address: mockSignerAddress,
        }
      },
    } as unknown as PrivyWallet
    const hostedCreateWalletSpy = vi
      .spyOn(hostedWalletProvider, 'createWallet')
      .mockResolvedValue(mockHostedWallet)
    const smartCreateWalletSpy = vi.spyOn(smartWalletProvider, 'createWallet')
    const walletProvider = new WalletProvider(
      hostedWalletProvider,
      smartWalletProvider,
    )

    const additionalOwners = [getRandomAddress(), getRandomAddress()]
    const nonce = BigInt(456)

    const smartWallet = await walletProvider.createWalletWithHostedSigner({
      owners: additionalOwners,
      nonce,
    })

    expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
    expect(hostedCreateWalletSpy).toHaveBeenCalledOnce()
    expect(smartCreateWalletSpy).toHaveBeenCalledWith({
      owners: [additionalOwners[0], additionalOwners[1], mockSignerAddress],
      signer: await mockHostedWallet.account(),
      nonce,
    })
  })

  it('should get a hosted wallet by ID', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const hostedWalletProvider = new PrivyHostedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const getWalletSpy = vi.spyOn(hostedWalletProvider, 'getWallet')
    const walletProvider = new WalletProvider(
      hostedWalletProvider,
      smartWalletProvider,
    )

    const createdWallet = await hostedWalletProvider.createWallet()
    const walletId = createdWallet.walletId

    const wallet: PrivyWallet = (await walletProvider.getHostedWallet({
      walletId,
    })) as PrivyWallet

    expect(wallet).toBeInstanceOf(PrivyWallet)
    expect(wallet.walletId).toBe(walletId)
    expect(getWalletSpy).toHaveBeenCalledWith({ walletId })
  })

  it('should get a smart wallet with hosted signer', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const hostedWalletProvider = new PrivyHostedWalletProvider(
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
    const mockHostedWallet = {
      walletId: 'mock-wallet-1',
      address: mockSignerAddress,
      account: async () => mockSigner,
    } as unknown as PrivyWallet

    const hostedGetWalletSpy = vi
      .spyOn(hostedWalletProvider, 'getWallet')
      .mockResolvedValue(mockHostedWallet)
    const smartGetWalletSpy = vi.spyOn(smartWalletProvider, 'getWallet')
    const mockWalletAddress = getRandomAddress()

    vi.spyOn(smartWalletProvider, 'getWalletAddress').mockResolvedValue(
      mockWalletAddress,
    )

    const walletProvider = new WalletProvider(
      hostedWalletProvider,
      smartWalletProvider,
    )

    const walletId = 'mock-wallet-1'
    const deploymentOwners = [mockSignerAddress]
    const signerOwnerIndex = 0

    const smartWallet = await walletProvider.getSmartWalletWithHostedSigner({
      walletId,
      deploymentOwners,
      signerOwnerIndex,
    })

    expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
    expect(hostedGetWalletSpy).toHaveBeenCalledWith({ walletId })
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
    const hostedWalletProvider = new PrivyHostedWalletProvider(
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
      hostedWalletProvider,
      smartWalletProvider,
    )

    const hostedWallet = await hostedWalletProvider.createWallet()
    const account = await hostedWallet.account()
    const deploymentOwners = [hostedWallet.address, getRandomAddress()]
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
    const hostedWalletProvider = new PrivyHostedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const walletProvider = new WalletProvider(
      hostedWalletProvider,
      smartWalletProvider,
    )

    const hostedWallet = await hostedWalletProvider.createWallet()
    const account = await hostedWallet.account()

    await expect(
      walletProvider.getSmartWallet({
        signer: account,
        // Missing both walletAddress and deploymentOwners
      }),
    ).rejects.toThrow(
      'Either walletAddress or deploymentOwners array must be provided to locate the smart wallet',
    )
  })

  it('should throw error when hosted wallet is not found', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const hostedWalletProvider = new PrivyHostedWalletProvider(
      mockPrivyClient,
      mockChainManager,
      mockLendProvider,
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const walletProvider = new WalletProvider(
      hostedWalletProvider,
      smartWalletProvider,
    )

    const invalidWalletId = 'invalid-wallet-id'

    await expect(
      walletProvider.getSmartWalletWithHostedSigner({
        walletId: invalidWalletId,
      }),
    ).rejects.toThrow('Failed to get wallet with id: invalid-wallet-id')
  })
})
