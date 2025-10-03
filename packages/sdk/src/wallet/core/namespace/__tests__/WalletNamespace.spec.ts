import type { PrivyClient } from '@privy-io/server-auth'
import { getAddress } from 'viem'
import { unichain } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { createMockPrivyClient } from '@/test/MockPrivyClient.js'
import { getRandomAddress } from '@/test/utils.js'
import { WalletNamespace } from '@/wallet/core/namespace/WalletNamespace.js'
import { DefaultSmartWalletProvider } from '@/wallet/core/providers/smart/default/DefaultSmartWalletProvider.js'
import { WalletProvider } from '@/wallet/core/providers/WalletProvider.js'
import { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import { DefaultSmartWallet } from '@/wallet/core/wallets/smart/default/DefaultSmartWallet.js'
import { PrivyHostedWalletProvider } from '@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js'

import { SmartWalletDeploymentError } from '../../wallets/smart/error/errors.js'

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
    it('should create a smart wallet and return deployment result', async () => {
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
          address: getAddress(privyWallet.address),
        })
      const owners = [getRandomAddress(), hostedWallet.address]
      const nonce = BigInt(123)

      const result = await walletNamespace.createSmartWallet({
        owners,
        signer: hostedWallet.signer,
        nonce,
      })

      expect(result.wallet).toBeInstanceOf(DefaultSmartWallet)
      expect(createSmartWalletSpy).toHaveBeenCalledWith({
        owners,
        signer: hostedWallet.signer,
        nonce,
      })
    })

    it('should report deployment successes and failures', async () => {
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

      // Create a hosted wallet to use as signer
      const privyWallet = await mockPrivyClient.walletApi.createWallet({
        chainType: 'ethereum',
      })
      const hostedWallet =
        await walletProvider.hostedWalletProvider.toVerbsWallet({
          walletId: privyWallet.id,
          address: getAddress(privyWallet.address),
        })
      const owners = [getRandomAddress(), hostedWallet.address]
      const nonce = BigInt(456)
      const deploymentChainIds = [130] as SupportedChainId[]

      // Mock the provider's createSmartWallet to return successes and failures
      const createSmartWalletSpy = vi.spyOn(walletProvider, 'createSmartWallet')
      const mockWallet = {} as DefaultSmartWallet

      createSmartWalletSpy.mockResolvedValueOnce({
        wallet: mockWallet,
        deployments: [
          { chainId: 130, receipt: undefined, success: true },
          {
            chainId: 8453,
            error: new SmartWalletDeploymentError(
              'Deployment failed on chain 8453',
              8453,
            ),
            success: false,
          },
        ],
      })

      const result = await walletNamespace.createSmartWallet({
        owners,
        signer: hostedWallet.signer,
        nonce,
        deploymentChainIds,
      })

      // Verify it was called with correct params
      expect(createSmartWalletSpy).toHaveBeenCalledWith({
        owners,
        signer: hostedWallet.signer,
        nonce,
        deploymentChainIds,
      })

      // Verify we have successes and failures
      expect(result).toEqual({
        wallet: mockWallet,
        deployments: [
          { chainId: 130, receipt: undefined, success: true },
          {
            chainId: 8453,
            error: new SmartWalletDeploymentError(
              'Deployment failed on chain 8453',
              8453,
            ),
            success: false,
          },
        ],
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
          address: getAddress(privyWallet.address),
        })
      const deploymentOwners = [hostedWallet.address, getRandomAddress()]
      const nonce = BigInt(789)
      const params = {
        signer: hostedWallet.signer,
        deploymentOwners,
        owners: [hostedWallet.signer.address],
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
          address: getAddress(privyWallet.address),
        })

      await expect(
        walletNamespace.getSmartWallet({
          signer: hostedWallet.signer,
          owners: [hostedWallet.signer.address],
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
          address: getAddress(privyWallet.address),
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
      expect(verbsWallet).toBeInstanceOf(Wallet)
      expect(verbsWallet.signer.address).toBe(hostedWallet.signer.address)
      expect(verbsWallet.address).toBe(hostedWallet.address)
    })
  })

  describe('createSigner', () => {
    it('should delegate to hosted wallet provider createSigner', async () => {
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
      const createSignerSpy = vi.spyOn(walletProvider, 'createSigner')
      const walletNamespace = new WalletNamespace(walletProvider)

      const privyWallet = await mockPrivyClient.walletApi.createWallet({
        chainType: 'ethereum',
      })
      const params = {
        walletId: privyWallet.id,
        address: getAddress(privyWallet.address),
      }

      const signer = await walletNamespace.createSigner(params)

      expect(createSignerSpy).toHaveBeenCalledWith(params)
      expect(signer.address).toBe(privyWallet.address)
      expect(signer.type).toBe('local')
    })

    it('should return a LocalAccount that can be used as a smart wallet signer', async () => {
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
      const signer = await walletNamespace.createSigner({
        walletId: privyWallet.id,
        address: getAddress(privyWallet.address),
      })

      // Use the signer to create a smart wallet
      const owners = [signer.address, getRandomAddress()]
      const { wallet: smartWallet } = await walletNamespace.createSmartWallet({
        owners,
        signer,
        nonce: 0n,
      })

      expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
      expect(smartWallet.signer).toBe(signer)
    })
  })
})
