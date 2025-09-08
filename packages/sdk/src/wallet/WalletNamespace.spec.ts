import type { PrivyClient } from '@privy-io/server-auth'
import { unichain } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VerbsWallet } from '@/index.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { createMockPrivyClient } from '@/test/MockPrivyClient.js'
import { getRandomAddress } from '@/test/utils.js'
import { DefaultSmartWallet } from '@/wallet/DefaultSmartWallet.js'
import { DefaultSmartWalletProvider } from '@/wallet/providers/DefaultSmartWalletProvider.js'
import { PrivyHostedWalletProvider } from '@/wallet/providers/PrivyHostedWalletProvider.js'
import { WalletNamespace } from '@/wallet/WalletNamespace.js'
import { WalletProvider } from '@/wallet/WalletProvider.js'

const mockChainManager = new MockChainManager({
  supportedChains: [unichain.id],
}) as unknown as ChainManager
const mockLendProvider = createMockLendProvider()

describe('WalletNamespace', () => {
  let mockPrivyClient: PrivyClient
  beforeEach(() => {
    mockPrivyClient = createMockPrivyClient('test-app-id', 'test-app-secret')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('hostedWalletProvider', () => {
    it('should provide access to hosted wallet provider', () => {
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
      const walletNamespace = new WalletNamespace(walletProvider)

      expect(walletNamespace.hostedWalletProvider).toBe(hostedWalletProvider)
    })
  })

  describe('smartWalletProvider', () => {
    it('should provide access to smart wallet provider', () => {
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
      const walletNamespace = new WalletNamespace(walletProvider)

      expect(walletNamespace.smartWalletProvider).toBe(smartWalletProvider)
    })
  })

  describe('createSmartWallet', () => {
    it('should create a smart wallet with provided signer and owners', async () => {
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
      const createSmartWalletSpy = vi.spyOn(walletProvider, 'createSmartWallet')
      const walletNamespace = new WalletNamespace(walletProvider)

      // Create a hosted wallet to use as signer
      const privyWallet = await mockPrivyClient.walletApi.createWallet({
        chainType: 'ethereum',
      })
      const hostedWallet =
        await walletProvider.hostedWalletProvider.toVerbsWallet({
          walletId: privyWallet.id,
          address: privyWallet.address,
        })
      const owners = [getRandomAddress(), hostedWallet.address]
      const nonce = BigInt(123)

      const smartWallet = await walletNamespace.createSmartWallet({
        owners,
        signer: hostedWallet.signer,
        nonce,
      })

      expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
      expect(smartWallet.signer).toBe(hostedWallet.signer)
      expect(createSmartWalletSpy).toHaveBeenCalledWith({
        owners,
        signer: hostedWallet.signer,
        nonce,
      })
    })
  })

  describe('getSmartWallet', () => {
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
      const walletProvider = new WalletProvider(
        hostedWalletProvider,
        smartWalletProvider,
      )
      const getSmartWalletSpy = vi.spyOn(walletProvider, 'getSmartWallet')
      const walletNamespace = new WalletNamespace(walletProvider)

      const privyWallet = await mockPrivyClient.walletApi.createWallet({
        chainType: 'ethereum',
      })
      const hostedWallet =
        await walletProvider.hostedWalletProvider.toVerbsWallet({
          walletId: privyWallet.id,
          address: privyWallet.address,
        })
      const deploymentOwners = [hostedWallet.address, getRandomAddress()]
      const signerOwnerIndex = 0
      const nonce = BigInt(789)
      const params = {
        signer: hostedWallet.signer,
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
      const walletNamespace = new WalletNamespace(walletProvider)

      const privyWallet = await mockPrivyClient.walletApi.createWallet({
        chainType: 'ethereum',
      })
      const hostedWallet =
        await walletProvider.hostedWalletProvider.toVerbsWallet({
          walletId: privyWallet.id,
          address: privyWallet.address,
        })

      await expect(
        walletNamespace.getSmartWallet({
          signer: hostedWallet.signer,
          // Missing both walletAddress and deploymentOwners
        }),
      ).rejects.toThrow(
        'Either walletAddress or deploymentOwners array must be provided to locate the smart wallet',
      )
    })
  })

  describe('hostedWalletToVerbsWallet', () => {
    it('should convert a hosted wallet to a Verbs wallet', async () => {
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
      const walletNamespace = new WalletNamespace(walletProvider)

      const privyWallet = await mockPrivyClient.walletApi.createWallet({
        chainType: 'ethereum',
      })
      const hostedWallet =
        await walletProvider.hostedWalletProvider.toVerbsWallet({
          walletId: privyWallet.id,
          address: privyWallet.address,
        })
      const toVerbsWalletSpy = vi.spyOn(
        walletProvider.hostedWalletProvider,
        'toVerbsWallet',
      )

      const verbsWallet = await walletNamespace.hostedWalletToVerbsWallet({
        walletId: privyWallet.id,
        address: privyWallet.address,
      })

      expect(toVerbsWalletSpy).toHaveBeenCalledWith({
        walletId: privyWallet.id,
        address: privyWallet.address,
      })
      expect(verbsWallet).toBeInstanceOf(VerbsWallet)
      expect(verbsWallet.signer.address).toBe(hostedWallet.signer.address)
      expect(verbsWallet.address).toBe(hostedWallet.address)
    })
  })
})
