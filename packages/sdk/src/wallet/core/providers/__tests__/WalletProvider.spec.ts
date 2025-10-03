import type { WaitForUserOperationReceiptReturnType } from 'viem/account-abstraction'
import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { createMockPrivyClient } from '@/test/MockPrivyClient.js'
import { getRandomAddress } from '@/test/utils.js'
import { DefaultSmartWalletProvider } from '@/wallet/core/providers/smart/default/DefaultSmartWalletProvider.js'
import { WalletProvider } from '@/wallet/core/providers/WalletProvider.js'
import { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import { DefaultSmartWallet } from '@/wallet/core/wallets/smart/default/DefaultSmartWallet.js'
import { SmartWalletDeploymentError } from '@/wallet/core/wallets/smart/error/errors.js'
import { PrivyHostedWalletProvider } from '@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js'
import type { PrivyWallet } from '@/wallet/node/wallets/hosted/privy/PrivyWallet.js'

const mockChainManager = new MockChainManager({
  supportedChains: [unichain.id],
}) as unknown as ChainManager
const mockLendProvider = createMockLendProvider()

describe('WalletProvider', () => {
  let mockPrivyClient: ReturnType<typeof createMockPrivyClient>

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrivyClient = createMockPrivyClient('test-app-id', 'test-app-secret')
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

      // Create a hosted wallet to use as signer
      const hostedWallet = (await hostedWalletProvider.toVerbsWallet({
        walletId: 'mock-wallet-1',
        address: getRandomAddress(),
      })) as PrivyWallet
      const signer = hostedWallet.signer
      const owners = [getRandomAddress(), hostedWallet.address]
      const nonce = BigInt(123)

      const mockWallet = {} as DefaultSmartWallet
      const mockDeploymentResult = {
        wallet: mockWallet,
        deployments: [
          {
            chainId: unichain.id as SupportedChainId,
            receipt: undefined,
            success: true,
          },
        ],
      }

      const createWalletSpy = vi
        .spyOn(smartWalletProvider, 'createWallet')
        .mockResolvedValue(mockDeploymentResult)

      const result = await walletProvider.createSmartWallet({
        owners,
        signer,
        nonce,
      })

      expect(createWalletSpy).toHaveBeenCalledWith({
        owners,
        signer,
        nonce,
      })
      expect(result).toEqual(mockDeploymentResult)
    })

    it('should pass through deployment successes and failures', async () => {
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
      const owners = [getRandomAddress(), hostedWallet.address]

      const mockWallet = {} as DefaultSmartWallet
      const mockReceipt = {
        success: true,
      } as unknown as WaitForUserOperationReceiptReturnType
      const mockDeploymentResult = {
        wallet: mockWallet,
        deployments: [
          {
            chainId: unichain.id as SupportedChainId,
            receipt: mockReceipt,
            success: true,
          },
          {
            chainId: 8453 as SupportedChainId,
            receipt: mockReceipt,
            success: false,
            error: new SmartWalletDeploymentError('Deployment failed', 8453),
          },
        ],
      }

      vi.spyOn(smartWalletProvider, 'createWallet').mockResolvedValue(
        mockDeploymentResult,
      )

      const result = await walletProvider.createSmartWallet({
        owners,
        signer,
      })

      expect(result).toEqual(mockDeploymentResult)
    })

    it('should forward deploymentChainIds parameter', async () => {
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
      const owners = [getRandomAddress(), hostedWallet.address]
      const deploymentChainIds: SupportedChainId[] = [8453]

      const mockWallet = {} as DefaultSmartWallet
      const mockDeploymentResult = {
        wallet: mockWallet,
        deployments: [
          {
            chainId: 8453 as SupportedChainId,
            receipt: undefined,
            success: true,
          },
        ],
      }

      const createWalletSpy = vi
        .spyOn(smartWalletProvider, 'createWallet')
        .mockResolvedValue(mockDeploymentResult)

      const result = await walletProvider.createSmartWallet({
        owners,
        signer,
        deploymentChainIds,
      })

      expect(createWalletSpy).toHaveBeenCalledWith({
        owners,
        signer,
        deploymentChainIds,
      })
      expect(result).toEqual(mockDeploymentResult)
    })

    it('should throw error if signer is not in owners array', async () => {
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
      // Signer is NOT in the owners array
      const owners = [getRandomAddress(), getRandomAddress()]

      await expect(
        walletProvider.createSmartWallet({
          owners,
          signer,
        }),
      ).rejects.toThrow('Signer must be in the owners array')
    })
  })

  describe('getSmartWallet', () => {
    it('should get a smart wallet with provided signer', async () => {
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
      const nonce = BigInt(789)

      const smartWallet = await walletProvider.getSmartWallet({
        signer,
        deploymentOwners,
        owners: [signer.address],
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
        owners: [signer.address],
      })
    })

    it('should throw error when getting smart wallet without required parameters', async () => {
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
          owners: [signer.address],
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
      const toVerbsWalletSpy = vi.spyOn(hostedWalletProvider, 'toVerbsWallet')

      const privyWallet = await mockPrivyClient.walletApi.createWallet({
        chainType: 'ethereum',
      })
      const hostedWallet = await walletProvider.hostedWalletToVerbsWallet({
        walletId: privyWallet.id,
        address: privyWallet.address,
      })

      expect(toVerbsWalletSpy).toHaveBeenCalledWith({
        walletId: privyWallet.id,
        address: privyWallet.address,
      })
      expect(hostedWallet).toBeInstanceOf(Wallet)
      expect(hostedWallet.signer.address).toBe(privyWallet.address)
      expect(hostedWallet.address).toBe(privyWallet.address)
    })
  })

  describe('createSigner', () => {
    it('should delegate to hosted wallet provider createSigner', async () => {
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
      const createSignerSpy = vi.spyOn(hostedWalletProvider, 'createSigner')

      const privyWallet = await mockPrivyClient.walletApi.createWallet({
        chainType: 'ethereum',
      })
      const params = {
        walletId: privyWallet.id,
        address: privyWallet.address,
      }

      const signer = await walletProvider.createSigner(params)

      expect(createSignerSpy).toHaveBeenCalledWith(params)
      expect(signer.address).toBe(privyWallet.address)
      expect(signer.type).toBe('local')
    })
  })
})
