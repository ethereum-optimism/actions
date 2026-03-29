import type { WaitForUserOperationReceiptReturnType } from 'viem/account-abstraction'
import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createMockPrivyClient,
  createMockPrivyWallet,
  getMockAuthorizationContext,
} from '@/__mocks__/MockPrivyClient.js'
import { getRandomAddress } from '@/__mocks__/utils.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import { createMockLendProvider } from '@/lend/__mocks__/MockLendProvider.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { DefaultSmartWalletProvider } from '@/wallet/core/providers/smart/default/DefaultSmartWalletProvider.js'
import { WalletProvider } from '@/wallet/core/providers/WalletProvider.js'
import { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import { DefaultSmartWallet } from '@/wallet/core/wallets/smart/default/DefaultSmartWallet.js'
import { SmartWalletDeploymentError } from '@/wallet/core/wallets/smart/error/errors.js'
import { PrivyEmbeddedWalletProvider } from '@/wallet/node/providers/embedded/privy/PrivyEmbeddedWalletProvider.js'
import type { PrivyWallet } from '@/wallet/node/wallets/embedded/privy/PrivyWallet.js'

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
      const embeddedWalletProvider = new PrivyEmbeddedWalletProvider({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
      })
      const smartWalletProvider = new DefaultSmartWalletProvider(
        mockChainManager,
        { morpho: mockLendProvider },
      )
      const walletProvider = new WalletProvider(
        embeddedWalletProvider,
        smartWalletProvider,
      )

      // Create a embedded wallet to use as signer
      const embeddedWallet = (await embeddedWalletProvider.toActionsWallet({
        walletId: 'mock-wallet-1',
        address: getRandomAddress(),
      })) as PrivyWallet
      const signer = embeddedWallet.signer
      const signers = [getRandomAddress(), embeddedWallet.address]
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
        signers,
        signer,
        nonce,
      })

      expect(createWalletSpy).toHaveBeenCalledWith({
        signers,
        signer,
        nonce,
      })
      expect(result).toEqual(mockDeploymentResult)
    })

    it('should pass through deployment successes and failures', async () => {
      const embeddedWalletProvider = new PrivyEmbeddedWalletProvider({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
      })
      const smartWalletProvider = new DefaultSmartWalletProvider(
        mockChainManager,
        { morpho: mockLendProvider },
      )
      const walletProvider = new WalletProvider(
        embeddedWalletProvider,
        smartWalletProvider,
      )

      const embeddedWallet = (await embeddedWalletProvider.toActionsWallet({
        walletId: 'mock-wallet-1',
        address: getRandomAddress(),
      })) as PrivyWallet
      const signer = embeddedWallet.signer
      const signers = [getRandomAddress(), embeddedWallet.address]

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
        signers,
        signer,
      })

      expect(result).toEqual(mockDeploymentResult)
    })

    it('should forward deploymentChainIds parameter', async () => {
      const embeddedWalletProvider = new PrivyEmbeddedWalletProvider({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
      })
      const smartWalletProvider = new DefaultSmartWalletProvider(
        mockChainManager,
        { morpho: mockLendProvider },
      )
      const walletProvider = new WalletProvider(
        embeddedWalletProvider,
        smartWalletProvider,
      )

      const embeddedWallet = (await embeddedWalletProvider.toActionsWallet({
        walletId: 'mock-wallet-1',
        address: getRandomAddress(),
      })) as PrivyWallet
      const signer = embeddedWallet.signer
      const signers = [getRandomAddress(), embeddedWallet.address]
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
        signers,
        signer,
        deploymentChainIds,
      })

      expect(createWalletSpy).toHaveBeenCalledWith({
        signers,
        signer,
        deploymentChainIds,
      })
      expect(result).toEqual(mockDeploymentResult)
    })

    it('should throw error if signer is not in signers array', async () => {
      const embeddedWalletProvider = new PrivyEmbeddedWalletProvider({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
      })
      const smartWalletProvider = new DefaultSmartWalletProvider(
        mockChainManager,
        { morpho: mockLendProvider },
      )
      const walletProvider = new WalletProvider(
        embeddedWalletProvider,
        smartWalletProvider,
      )

      const embeddedWallet = (await embeddedWalletProvider.toActionsWallet({
        walletId: 'mock-wallet-1',
        address: getRandomAddress(),
      })) as PrivyWallet
      const signer = embeddedWallet.signer
      // Signer is NOT in the signers array
      const signers = [getRandomAddress(), getRandomAddress()]

      await expect(
        walletProvider.createSmartWallet({
          signers,
          signer,
        }),
      ).rejects.toThrow('Signer does not match any signer in the signers array')
    })
  })

  describe('getSmartWallet', () => {
    it('should get a smart wallet with provided signer', async () => {
      const embeddedWalletProvider = new PrivyEmbeddedWalletProvider({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
      })
      const smartWalletProvider = new DefaultSmartWalletProvider(
        mockChainManager,
        { morpho: mockLendProvider },
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

      const embeddedWallet = (await embeddedWalletProvider.toActionsWallet({
        walletId: 'mock-wallet-1',
        address: getRandomAddress(),
      })) as PrivyWallet
      const signer = embeddedWallet.signer
      const deploymentSigners = [embeddedWallet.address, getRandomAddress()]
      const nonce = BigInt(789)

      const smartWallet = await walletProvider.getSmartWallet({
        signer,
        deploymentSigners,
        signers: [signer.address],
        nonce,
      })

      expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
      expect(getWalletAddressSpy).toHaveBeenCalledWith({
        signers: deploymentSigners,
        nonce,
      })
      expect(getWalletSpy).toHaveBeenCalledWith({
        walletAddress: mockWalletAddress,
        signer,
        signers: [signer.address],
      })
    })

    it('should throw error when getting smart wallet without required parameters', async () => {
      const embeddedWalletProvider = new PrivyEmbeddedWalletProvider({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
      })
      const smartWalletProvider = new DefaultSmartWalletProvider(
        mockChainManager,
        { morpho: mockLendProvider },
      )
      const walletProvider = new WalletProvider(
        embeddedWalletProvider,
        smartWalletProvider,
      )

      const embeddedWallet = (await embeddedWalletProvider.toActionsWallet({
        walletId: 'mock-wallet-1',
        address: getRandomAddress(),
      })) as PrivyWallet
      const signer = embeddedWallet.signer

      await expect(
        walletProvider.getSmartWallet({
          signer,
          signers: [signer.address],
          // Missing both walletAddress and deploymentSigners
        }),
      ).rejects.toThrow(
        'Either walletAddress or deploymentSigners array must be provided to locate the smart wallet',
      )
    })
  })

  describe('embeddedWalletToActionsWallet', () => {
    it('should convert a embedded wallet to an Actions wallet', async () => {
      const embeddedWalletProvider = new PrivyEmbeddedWalletProvider({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
      })
      const smartWalletProvider = new DefaultSmartWalletProvider(
        mockChainManager,
        { morpho: mockLendProvider },
      )
      const walletProvider = new WalletProvider(
        embeddedWalletProvider,
        smartWalletProvider,
      )
      const toActionsWalletSpy = vi.spyOn(
        embeddedWalletProvider,
        'toActionsWallet',
      )

      const privyWallet = createMockPrivyWallet()
      const embeddedWallet = await walletProvider.embeddedWalletToActionsWallet({
        walletId: privyWallet.id,
        address: privyWallet.address,
      })

      expect(toActionsWalletSpy).toHaveBeenCalledWith({
        walletId: privyWallet.id,
        address: privyWallet.address,
      })
      expect(embeddedWallet).toBeInstanceOf(Wallet)
      expect(embeddedWallet.signer.address).toBe(privyWallet.address)
      expect(embeddedWallet.address).toBe(privyWallet.address)
    })
  })

  describe('createSigner', () => {
    it('should delegate to embedded wallet provider createSigner', async () => {
      const mockPrivyClient = createMockPrivyClient(
        'test-app-id',
        'test-app-secret',
      )
      const embeddedWalletProvider = new PrivyEmbeddedWalletProvider({
        privyClient: mockPrivyClient,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
      })
      const smartWalletProvider = new DefaultSmartWalletProvider(
        mockChainManager,
        { morpho: mockLendProvider },
      )
      const walletProvider = new WalletProvider(
        embeddedWalletProvider,
        smartWalletProvider,
      )
      const createSignerSpy = vi.spyOn(embeddedWalletProvider, 'createSigner')

      const privyWallet = createMockPrivyWallet()
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
