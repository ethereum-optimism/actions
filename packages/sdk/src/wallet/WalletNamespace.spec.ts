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
import { WalletNamespace } from '@/wallet/WalletNamespace.js'
import { WalletProvider } from '@/wallet/WalletProvider.js'

const mockChainManager = new MockChainManager({
  supportedChains: [unichain.id],
}) as unknown as ChainManager
const mockLendProvider = createMockLendProvider()

describe('WalletNamespace', () => {
  it('should provide access to embedded wallet provider', () => {
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
    const walletNamespace = new WalletNamespace(walletProvider)

    expect(walletNamespace.embeddedWalletProvider).toBe(embeddedWalletProvider)
  })

  it('should provide access to smart wallet provider', () => {
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
    const walletNamespace = new WalletNamespace(walletProvider)

    expect(walletNamespace.smartWalletProvider).toBe(smartWalletProvider)
  })

  it('should create an embedded wallet via namespace', async () => {
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
    const createEmbeddedWalletSpy = vi.spyOn(
      walletProvider,
      'createEmbeddedWallet',
    )
    const walletNamespace = new WalletNamespace(walletProvider)

    const wallet: PrivyWallet =
      (await walletNamespace.createEmbeddedWallet()) as PrivyWallet

    expect(wallet).toBeInstanceOf(PrivyWallet)
    expect(wallet.walletId).toMatch(/^mock-wallet-\d+$/)
    expect(isAddress(wallet.address)).toBe(true)
    expect(createEmbeddedWalletSpy).toHaveBeenCalledOnce()
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
    const walletProvider = new WalletProvider(
      embeddedWalletProvider,
      smartWalletProvider,
    )
    const createSmartWalletSpy = vi.spyOn(walletProvider, 'createSmartWallet')
    const walletNamespace = new WalletNamespace(walletProvider)

    // Create an embedded wallet to use as signer
    const embeddedWallet = await embeddedWalletProvider.createWallet()
    const signer = await embeddedWallet.signer()
    const owners = [getRandomAddress(), embeddedWallet.address]
    const nonce = BigInt(123)

    const smartWallet = await walletNamespace.createSmartWallet({
      owners,
      signer,
      nonce,
    })

    expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
    expect(smartWallet.signer).toBe(signer)
    expect(createSmartWalletSpy).toHaveBeenCalledWith({
      owners,
      signer,
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
    const walletProvider = new WalletProvider(
      embeddedWalletProvider,
      smartWalletProvider,
    )
    const createWalletWithEmbeddedSignerSpy = vi.spyOn(
      walletProvider,
      'createWalletWithEmbeddedSigner',
    )
    const walletNamespace = new WalletNamespace(walletProvider)

    const smartWallet = await walletNamespace.createWalletWithEmbeddedSigner()

    expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
    expect(createWalletWithEmbeddedSignerSpy).toHaveBeenCalledWith(undefined)
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
    const walletProvider = new WalletProvider(
      embeddedWalletProvider,
      smartWalletProvider,
    )
    const createWalletWithEmbeddedSignerSpy = vi.spyOn(
      walletProvider,
      'createWalletWithEmbeddedSigner',
    )
    const walletNamespace = new WalletNamespace(walletProvider)

    const additionalOwners = [getRandomAddress(), getRandomAddress()]
    const embeddedWalletIndex = 1
    const nonce = BigInt(456)
    const params = {
      owners: additionalOwners,
      embeddedWalletIndex,
      nonce,
    }

    const smartWallet =
      await walletNamespace.createWalletWithEmbeddedSigner(params)

    expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
    expect(createWalletWithEmbeddedSignerSpy).toHaveBeenCalledWith(params)
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
    const walletProvider = new WalletProvider(
      embeddedWalletProvider,
      smartWalletProvider,
    )
    const getEmbeddedWalletSpy = vi.spyOn(walletProvider, 'getEmbeddedWallet')
    const walletNamespace = new WalletNamespace(walletProvider)

    const createdWallet = await embeddedWalletProvider.createWallet()
    const walletId = createdWallet.walletId

    const wallet: PrivyWallet = (await walletNamespace.getEmbeddedWallet({
      walletId,
    })) as PrivyWallet

    expect(wallet).toBeInstanceOf(PrivyWallet)
    expect(wallet.walletId).toBe(walletId)
    expect(getEmbeddedWalletSpy).toHaveBeenCalledWith({ walletId })
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
    const walletProvider = new WalletProvider(
      embeddedWalletProvider,
      smartWalletProvider,
    )
    const getSmartWalletWithEmbeddedSignerSpy = vi.spyOn(
      walletProvider,
      'getSmartWalletWithEmbeddedSigner',
    )
    const walletNamespace = new WalletNamespace(walletProvider)

    const embeddedWallet = await embeddedWalletProvider.createWallet()
    const walletId = embeddedWallet.walletId
    const deploymentOwners = [embeddedWallet.address]
    const signerOwnerIndex = 0
    const params = {
      walletId,
      deploymentOwners,
      signerOwnerIndex,
    }

    const smartWallet =
      await walletNamespace.getSmartWalletWithEmbeddedSigner(params)

    expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
    expect(getSmartWalletWithEmbeddedSignerSpy).toHaveBeenCalledWith(params)
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
    const walletProvider = new WalletProvider(
      embeddedWalletProvider,
      smartWalletProvider,
    )
    const getSmartWalletSpy = vi.spyOn(walletProvider, 'getSmartWallet')
    const walletNamespace = new WalletNamespace(walletProvider)

    const embeddedWallet = await embeddedWalletProvider.createWallet()
    const signer = await embeddedWallet.signer()
    const deploymentOwners = [embeddedWallet.address, getRandomAddress()]
    const signerOwnerIndex = 0
    const nonce = BigInt(789)
    const params = {
      signer,
      deploymentOwners,
      signerOwnerIndex,
      nonce,
    }

    const smartWallet = await walletNamespace.getSmartWallet(params)

    expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
    expect(getSmartWalletSpy).toHaveBeenCalledWith(params)
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
    const walletNamespace = new WalletNamespace(walletProvider)

    const embeddedWallet = await embeddedWalletProvider.createWallet()
    const signer = await embeddedWallet.signer()

    await expect(
      walletNamespace.getSmartWallet({
        signer,
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
    const walletNamespace = new WalletNamespace(walletProvider)

    const invalidWalletId = 'invalid-wallet-id'

    await expect(
      walletNamespace.getSmartWalletWithEmbeddedSigner({
        walletId: invalidWalletId,
      }),
    ).rejects.toThrow('Failed to get wallet with id: invalid-wallet-id')
  })
})
