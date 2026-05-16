import type { PrivyClient } from '@privy-io/node'
import { getAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { unichain } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createMockPrivyClient,
  createMockPrivyWallet,
  getMockAuthorizationContext,
} from '@/__mocks__/MockPrivyClient.js'
import { getRandomAddress } from '@/__mocks__/utils.js'
import { createMockLendProvider } from '@/actions/lend/__mocks__/MockLendProvider.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { WalletNamespace } from '@/wallet/core/namespace/WalletNamespace.js'
import { DefaultSmartWalletProvider } from '@/wallet/core/providers/smart/default/DefaultSmartWalletProvider.js'
import { WalletProvider } from '@/wallet/core/providers/WalletProvider.js'
import { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import { DefaultSmartWallet } from '@/wallet/core/wallets/smart/default/DefaultSmartWallet.js'
import { PrivyEmbeddedWalletProvider } from '@/wallet/node/providers/embedded/privy/PrivyEmbeddedWalletProvider.js'

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

  describe('embeddedWalletProvider', () => {
    it('should provide access to hosted wallet provider', () => {
      const embeddedWalletProvider = new PrivyEmbeddedWalletProvider({
        privyClient: mockPrivyClient,
        chainManager: mockChainManager,
        authorizationContext: getMockAuthorizationContext(),
      })
      const smartWalletProvider = new DefaultSmartWalletProvider(
        mockChainManager,
        { morpho: mockLendProvider },
      )
      const walletProvider = new WalletProvider(
        embeddedWalletProvider,
        smartWalletProvider,
      )
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        lendProviders: {},
        swapProviders: {},
        supportedAssets: [],
      })

      expect(walletNamespace.embeddedWalletProvider).toBe(embeddedWalletProvider)
    })
  })

  describe('smartWalletProvider', () => {
    it('should provide access to smart wallet provider', async () => {
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
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        lendProviders: {},
        swapProviders: {},
        supportedAssets: [],
      })

      expect(await walletNamespace.smartWalletProvider()).toBe(
        smartWalletProvider,
      )
    })
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
      const createSmartWalletSpy = vi.spyOn(walletProvider, 'createSmartWallet')
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        lendProviders: {},
        swapProviders: {},
        supportedAssets: [],
      })

      // Create a hosted wallet to use as signer
      const privyWallet = createMockPrivyWallet()
      const hostedWallet =
        await walletProvider.embeddedWalletProvider.toActionsWallet({
          walletId: privyWallet.id,
          address: getAddress(privyWallet.address),
        })
      const signers = [getRandomAddress(), hostedWallet.address]
      const nonce = BigInt(123)

      const result = await walletNamespace.createSmartWallet({
        signers,
        signer: hostedWallet.signer,
        nonce,
      })

      expect(result.wallet).toBeInstanceOf(DefaultSmartWallet)
      expect(createSmartWalletSpy).toHaveBeenCalledWith({
        signers,
        signer: hostedWallet.signer,
        nonce,
      })
    })

    it('should report deployment successes and failures', async () => {
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
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        lendProviders: {},
        swapProviders: {},
        supportedAssets: [],
      })

      // Create a hosted wallet to use as signer
      const privyWallet = createMockPrivyWallet()
      const hostedWallet =
        await walletProvider.embeddedWalletProvider.toActionsWallet({
          walletId: privyWallet.id,
          address: getAddress(privyWallet.address),
        })
      const signers = [getRandomAddress(), hostedWallet.address]
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
        signers,
        signer: hostedWallet.signer,
        nonce,
        deploymentChainIds,
      })

      // Verify it was called with correct params
      expect(createSmartWalletSpy).toHaveBeenCalledWith({
        signers,
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
      const getSmartWalletSpy = vi.spyOn(walletProvider, 'getSmartWallet')
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        lendProviders: {},
        swapProviders: {},
        supportedAssets: [],
      })

      const privyWallet = createMockPrivyWallet()
      const hostedWallet =
        await walletProvider.embeddedWalletProvider.toActionsWallet({
          walletId: privyWallet.id,
          address: getAddress(privyWallet.address),
        })
      const deploymentSigners = [hostedWallet.address, getRandomAddress()]
      const nonce = BigInt(789)
      const params = {
        signer: hostedWallet.signer,
        deploymentSigners,
        signers: [hostedWallet.signer.address],
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
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        lendProviders: {},
        swapProviders: {},
        supportedAssets: [],
      })

      const privyWallet = createMockPrivyWallet()
      const hostedWallet =
        await walletProvider.embeddedWalletProvider.toActionsWallet({
          walletId: privyWallet.id,
          address: getAddress(privyWallet.address),
        })

      await expect(
        walletNamespace.getSmartWallet({
          signer: hostedWallet.signer,
          signers: [hostedWallet.signer.address],
          // Missing both walletAddress and deploymentSigners
        }),
      ).rejects.toThrow(
        'Either walletAddress or deploymentSigners array must be provided to locate the smart wallet',
      )
    })
  })

  describe('toActionsWallet', () => {
    it('should convert a hosted wallet to an Actions wallet', async () => {
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
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        lendProviders: {},
        swapProviders: {},
        supportedAssets: [],
      })

      const privyWallet = createMockPrivyWallet()
      const hostedWallet =
        await walletProvider.embeddedWalletProvider.toActionsWallet({
          walletId: privyWallet.id,
          address: getAddress(privyWallet.address),
        })
      const toActionsWalletSpy = vi.spyOn(
        walletProvider.embeddedWalletProvider,
        'toActionsWallet',
      )

      const actionsWallet = await walletNamespace.toActionsWallet({
        walletId: privyWallet.id,
        address: privyWallet.address,
      })

      expect(toActionsWalletSpy).toHaveBeenCalledWith({
        walletId: privyWallet.id,
        address: privyWallet.address,
      })
      expect(actionsWallet).toBeInstanceOf(Wallet)
      expect(actionsWallet.signer.address).toBe(hostedWallet.signer.address)
      expect(actionsWallet.address).toBe(hostedWallet.address)
    })
  })

  describe('toActionsWallet with LocalAccount', () => {
    it('should create a LocalWallet from a viem LocalAccount', async () => {
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
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        lendProviders: {},
        swapProviders: {},
        supportedAssets: [],
      })

      const account = privateKeyToAccount(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      )

      const wallet = await walletNamespace.toActionsWallet(account)

      expect(wallet.address).toBe(account.address)
      expect(wallet.signer).toBe(account)
    })

    it('should expose lend namespace when an Aave provider is configured', async () => {
      const mockAaveProvider = createMockLendProvider()
      const smartWalletProvider = new DefaultSmartWalletProvider(
        mockChainManager,
        { aave: mockAaveProvider },
      )
      const walletProvider = new WalletProvider(undefined, smartWalletProvider)
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        lendProviders: { aave: mockAaveProvider },
        swapProviders: {},
        supportedAssets: [],
      })

      const account = privateKeyToAccount(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      )

      const wallet = await walletNamespace.toActionsWallet(account)

      expect(wallet.lend).toBeDefined()
    })

    it('should accept a LocalAccount when no hosted wallet provider is configured', async () => {
      const smartWalletProvider = new DefaultSmartWalletProvider(
        mockChainManager,
        { morpho: mockLendProvider },
      )
      const walletProvider = new WalletProvider(undefined, smartWalletProvider)
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        lendProviders: {},
        swapProviders: {},
        supportedAssets: [],
      })

      const account = privateKeyToAccount(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      )

      const wallet = await walletNamespace.toActionsWallet(account)

      expect(wallet.address).toBe(account.address)
      expect(wallet.signer).toBe(account)
    })
  })

  describe('createSigner', () => {
    it('should delegate to hosted wallet provider createSigner', async () => {
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
      const createSignerSpy = vi.spyOn(walletProvider, 'createSigner')
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        lendProviders: {},
        swapProviders: {},
        supportedAssets: [],
      })

      const privyWallet = createMockPrivyWallet()
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
      const walletNamespace = new WalletNamespace(walletProvider, {
        chainManager: mockChainManager,
        lendProviders: {},
        swapProviders: {},
        supportedAssets: [],
      })

      const privyWallet = createMockPrivyWallet()
      const signer = await walletNamespace.createSigner({
        walletId: privyWallet.id,
        address: getAddress(privyWallet.address),
      })

      // Use the signer to create a smart wallet
      const signers = [signer.address, getRandomAddress()]
      const { wallet: smartWallet } = await walletNamespace.createSmartWallet({
        signers,
        signer,
        nonce: 0n,
      })

      expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
      expect(smartWallet.signer).toBe(signer)
    })
  })
})
