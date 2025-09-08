import { unichain } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { createMockPrivyClient } from '@/test/MockPrivyClient.js'
import { getRandomAddress } from '@/test/utils.js'
import { DefaultSmartWallet } from '@/wallet/DefaultSmartWallet.js'
import type { PrivyWallet } from '@/wallet/PrivyWallet.js'
import { DefaultSmartWalletProvider } from '@/wallet/providers/DefaultSmartWalletProvider.js'
import { PrivyHostedWalletProvider } from '@/wallet/providers/PrivyHostedWalletProvider.js'
import { WalletProvider } from '@/wallet/WalletProvider.js'

const mockChainManager = new MockChainManager({
  supportedChains: [unichain.id],
}) as unknown as ChainManager
const mockLendProvider = createMockLendProvider()

describe('WalletProvider', () => {
  it('should create a smart wallet with provided signer and owners', async () => {
    const mockPrivyClient = createMockPrivyClient(
      'test-app-id',
      'test-app-secret',
    )
    const hostedWalletProvider = new PrivyHostedWalletProvider(
      mockPrivyClient,
      mockChainManager,
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
    const hostedWallet = (await hostedWalletProvider.toVerbsWallet({
      walletId: 'mock-wallet-1',
      address: getRandomAddress(),
    })) as PrivyWallet
    const signer = hostedWallet.signer
    const owners = [getRandomAddress(), hostedWallet.address]
    const nonce = BigInt(123)

    const smartWallet = await walletProvider.createSmartWallet({
      owners,
      signer,
      nonce,
    })

    expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
    expect(smartWallet.signer).toBe(signer)
    expect(createWalletSpy).toHaveBeenCalledWith({
      owners,
      signer,
      nonce,
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

    const hostedWallet = (await hostedWalletProvider.toVerbsWallet({
      walletId: 'mock-wallet-1',
      address: getRandomAddress(),
    })) as PrivyWallet
    const signer = hostedWallet.signer
    const deploymentOwners = [hostedWallet.address, getRandomAddress()]
    const signerOwnerIndex = 0
    const nonce = BigInt(789)

    const smartWallet = await walletProvider.getSmartWallet({
      signer,
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
      signer,
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
    )
    const smartWalletProvider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const walletProvider = new WalletProvider(
      hostedWalletProvider,
      smartWalletProvider,
    )

    const hostedWallet = (await hostedWalletProvider.toVerbsWallet({
      walletId: 'mock-wallet-1',
      address: getRandomAddress(),
    })) as PrivyWallet
    const signer = hostedWallet.signer

    await expect(
      walletProvider.getSmartWallet({
        signer,
        // Missing both walletAddress and deploymentOwners
      }),
    ).rejects.toThrow(
      'Either walletAddress or deploymentOwners array must be provided to locate the smart wallet',
    )
  })
})
