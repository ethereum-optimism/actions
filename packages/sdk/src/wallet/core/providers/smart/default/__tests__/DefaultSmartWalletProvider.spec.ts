import {
  type Address,
  isHex,
  keccak256,
  type LocalAccount,
  pad,
  size,
  slice,
  toHex,
} from 'viem'
import type {
  WaitForUserOperationReceiptReturnType,
  WebAuthnAccount,
} from 'viem/account-abstraction'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { getRandomAddress } from '@/test/utils.js'
import { DefaultSmartWalletProvider } from '@/wallet/core/providers/smart/default/DefaultSmartWalletProvider.js'
import { createMock as createDefaultSmartWalletMock } from '@/wallet/core/wallets/smart/default/__mocks__/DefaultSmartWallet.js'
import {
  smartWalletFactoryAbi,
  smartWalletFactoryAddress,
} from '@/wallet/core/wallets/smart/default/constants/index.js'
import { DefaultSmartWallet } from '@/wallet/core/wallets/smart/default/DefaultSmartWallet.js'

const mockChainManager = new MockChainManager({
  supportedChains: [1, 130],
}) as unknown as ChainManager
const mockLendProvider = createMockLendProvider()
const mockSigner: LocalAccount = {
  address: getRandomAddress(),
  type: 'local',
} as unknown as LocalAccount
const supportedAssets = undefined

describe('DefaultSmartWalletProvider', () => {
  const mockWallet: ReturnType<typeof createDefaultSmartWalletMock> =
    createDefaultSmartWalletMock({
      address: getRandomAddress(),
      signer: mockSigner,
    })
  const createWalletSpy = vi
    .spyOn(DefaultSmartWallet, 'create')
    .mockResolvedValue(mockWallet as unknown as DefaultSmartWallet)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('computeAttributionSuffix', () => {
    it('returns first 16 bytes of keccak256(input)', () => {
      const input = 'attribution-seed'
      const expected = slice(keccak256(toHex(input)), 0, 16)

      const actual = DefaultSmartWalletProvider.computeAttributionSuffix(input)

      expect(actual).toBe(expected)
      expect(isHex(actual)).toBe(true)
      expect(size(actual)).toBe(16)
    })

    it('always returns a 16-byte suffix for arbitrarily long input', () => {
      const input = 'x'.repeat(10_000)
      const expected = slice(keccak256(toHex(input)), 0, 16)

      const actual = DefaultSmartWalletProvider.computeAttributionSuffix(input)

      expect(actual).toBe(expected)
      expect(isHex(actual)).toBe(true)
      expect(size(actual)).toBe(16)
    })
  })

  it('should create a wallet and return deployment results', async () => {
    const provider = new DefaultSmartWalletProvider(mockChainManager, {
      morpho: mockLendProvider,
    })
    const signers = [mockSigner.address, getRandomAddress()]
    const nonce = BigInt(123)

    // Mock deploy to succeed for all chains
    vi.mocked(mockWallet.deploy).mockResolvedValueOnce({
      chainId: 1,
      success: true,
      receipt: undefined,
    })
    vi.mocked(mockWallet.deploy).mockResolvedValueOnce({
      chainId: 130,
      success: true,
      receipt: undefined,
    })

    const result = await provider.createWallet({
      signers,
      signer: mockSigner,
      nonce,
    })

    expect(result.wallet).toBe(mockWallet)
    expect(result.wallet.signer).toBe(mockSigner)
    expect(result).toEqual({
      wallet: mockWallet,
      deployments: [
        { chainId: 1, receipt: undefined, success: true },
        { chainId: 130, receipt: undefined, success: true },
      ],
    })

    // Verify deploy was called for each supported chain
    expect(mockWallet.deploy).toHaveBeenCalledTimes(2)
    expect(mockWallet.deploy).toHaveBeenCalledWith(1)
    expect(mockWallet.deploy).toHaveBeenCalledWith(130)
  })

  it('should report deployment successes across multiple chains', async () => {
    const provider = new DefaultSmartWalletProvider(mockChainManager, {
      morpho: mockLendProvider,
    })
    const signers = [mockSigner.address, getRandomAddress()]
    const nonce = BigInt(123)

    const mockReceipt = {
      txHash: '0x123',
      success: true,
    } as unknown as WaitForUserOperationReceiptReturnType
    // Mock deploy to succeed for different chains
    vi.mocked(mockWallet.deploy)
      .mockResolvedValueOnce({
        chainId: 1,
        success: true,
        receipt: mockReceipt,
      })
      .mockResolvedValueOnce({
        chainId: 130,
        success: true,
        receipt: undefined,
      })

    const result = await provider.createWallet({
      signers,
      signer: mockSigner,
      nonce,
    })

    expect(result.deployments).toEqual([
      { chainId: 1, receipt: mockReceipt, success: true },
      { chainId: 130, receipt: undefined, success: true },
    ])

    // Verify deploy was called once per chain
    expect(mockWallet.deploy).toHaveBeenCalledTimes(2)
    expect(mockWallet.deploy).toHaveBeenCalledWith(1)
    expect(mockWallet.deploy).toHaveBeenCalledWith(130)
  })

  it('should report deployment failures', async () => {
    const provider = new DefaultSmartWalletProvider(mockChainManager, {
      morpho: mockLendProvider,
    })
    const signers = [mockSigner.address, getRandomAddress()]
    const nonce = BigInt(123)

    // Mock deploy to fail for all chains
    const { SmartWalletDeploymentError } = await import(
      '@/wallet/core/wallets/smart/error/errors.js'
    )
    vi.mocked(mockWallet.deploy)
      .mockRejectedValueOnce(
        new SmartWalletDeploymentError('Deployment failed', 1),
      )
      .mockRejectedValueOnce(
        new SmartWalletDeploymentError('Deployment failed', 130),
      )

    const result = await provider.createWallet({
      signers,
      signer: mockSigner,
      nonce,
    })

    expect(result).toEqual({
      wallet: mockWallet,
      deployments: [
        {
          chainId: 1,
          error: new SmartWalletDeploymentError('Deployment failed', 1),
          success: false,
        },
        {
          chainId: 130,
          error: new SmartWalletDeploymentError('Deployment failed', 130),
          success: false,
        },
      ],
    })

    // Verify deploy was called for each chain
    expect(mockWallet.deploy).toHaveBeenCalledTimes(2)
  })

  it('should handle mixed deployment successes and failures', async () => {
    const provider = new DefaultSmartWalletProvider(mockChainManager, {
      morpho: mockLendProvider,
    })
    const signers = [mockSigner.address, getRandomAddress()]
    const nonce = BigInt(123)

    const { SmartWalletDeploymentError } = await import(
      '@/wallet/core/wallets/smart/error/errors.js'
    )

    // Mock deploy to succeed for chain 1, fail for chain 130
    vi.mocked(mockWallet.deploy)
      .mockResolvedValueOnce({
        chainId: 1,
        success: true,
        receipt: undefined,
      })
      .mockRejectedValueOnce(
        new SmartWalletDeploymentError('Deployment failed on chain 130', 130),
      )

    const result = await provider.createWallet({
      signers,
      signer: mockSigner,
      nonce,
    })

    expect(result).toEqual({
      wallet: mockWallet,
      deployments: [
        { chainId: 1, receipt: undefined, success: true },
        {
          chainId: 130,
          error: new SmartWalletDeploymentError(
            'Deployment failed on chain 130',
            130,
          ),
          success: false,
        },
      ],
    })

    // Verify deploy was called for both chains
    expect(mockWallet.deploy).toHaveBeenCalledTimes(2)
    expect(mockWallet.deploy).toHaveBeenCalledWith(1)
    expect(mockWallet.deploy).toHaveBeenCalledWith(130)
  })

  it('should respect deploymentChainIds parameter', async () => {
    const provider = new DefaultSmartWalletProvider(mockChainManager, {
      morpho: mockLendProvider,
    })
    const signers = [mockSigner.address, getRandomAddress()]
    const nonce = BigInt(123)
    const deploymentChainIds: SupportedChainId[] = [1]

    vi.mocked(mockWallet.deploy).mockResolvedValue({
      chainId: 1,
      success: true,
      receipt: undefined,
    })

    const result = await provider.createWallet({
      signers,
      signer: mockSigner,
      nonce,
      deploymentChainIds,
    })

    // Should only call deploy once for chain 1
    expect(mockWallet.deploy).toHaveBeenCalledTimes(1)
    expect(mockWallet.deploy).toHaveBeenCalledWith(1)
    expect(result).toEqual({
      wallet: mockWallet,
      deployments: [{ chainId: 1, receipt: undefined, success: true }],
    })
  })

  it('should throw error for non-SmartWalletDeploymentError failures', async () => {
    const provider = new DefaultSmartWalletProvider(mockChainManager, {
      morpho: mockLendProvider,
    })
    const signers = [mockSigner.address, getRandomAddress()]
    const nonce = BigInt(123)

    // Mock deploy to throw a generic error (not SmartWalletDeploymentError)
    vi.mocked(mockWallet.deploy).mockRejectedValue(new Error('Generic error'))

    await expect(
      provider.createWallet({
        signers,
        signer: mockSigner,
        nonce,
      }),
    ).rejects.toThrow('Unknown error')
  })

  it('should get wallet address with correct contract call', async () => {
    const provider = new DefaultSmartWalletProvider(mockChainManager, {
      morpho: mockLendProvider,
    })
    const signers = [mockSigner.address, getRandomAddress()]
    const nonce = BigInt(456)
    const mockAddress = getRandomAddress()

    const publicClient = vi.mocked(mockChainManager.getPublicClient(1))
    publicClient.readContract = vi.fn().mockResolvedValue(mockAddress)

    const address = await provider.getWalletAddress({ signers, nonce })

    expect(address).toBe(mockAddress)
    expect(publicClient.readContract).toHaveBeenCalledWith({
      abi: smartWalletFactoryAbi,
      address: smartWalletFactoryAddress,
      functionName: 'getAddress',
      args: [signers.map((signer) => pad(signer)), nonce],
    })
  })

  it('should get wallet address with default nonce', async () => {
    const provider = new DefaultSmartWalletProvider(mockChainManager, {
      morpho: mockLendProvider,
    })
    const signers = [getRandomAddress()]
    const mockAddress = getRandomAddress()

    const publicClient = vi.mocked(mockChainManager.getPublicClient(1))
    publicClient.readContract = vi.fn().mockResolvedValue(mockAddress)

    const address = await provider.getWalletAddress({ signers })

    expect(address).toBe(mockAddress)
    expect(publicClient.readContract).toHaveBeenCalledWith({
      abi: smartWalletFactoryAbi,
      address: smartWalletFactoryAddress,
      functionName: 'getAddress',
      args: [signers.map((signer) => pad(signer)), BigInt(0)],
    })
  })

  it('should handle WebAuthn accounts in wallet address calculation', async () => {
    const provider = new DefaultSmartWalletProvider(mockChainManager, {
      morpho: mockLendProvider,
    })
    const webAuthnAccount: WebAuthnAccount = {
      type: 'webAuthn',
      publicKey: '0x123456789abcdef',
    } as unknown as WebAuthnAccount
    const signers = [getRandomAddress(), webAuthnAccount]
    const mockAddress = getRandomAddress()

    const publicClient = vi.mocked(mockChainManager.getPublicClient(1))
    publicClient.readContract = vi.fn().mockResolvedValue(mockAddress)

    const address = await provider.getWalletAddress({ signers })

    expect(address).toBe(mockAddress)
    expect(publicClient.readContract).toHaveBeenCalledWith({
      abi: smartWalletFactoryAbi,
      address: smartWalletFactoryAddress,
      functionName: 'getAddress',
      args: [
        [pad(signers[0] as Address), webAuthnAccount.publicKey],
        BigInt(0),
      ],
    })
  })

  it('should throw error for invalid signer type', async () => {
    const provider = new DefaultSmartWalletProvider(mockChainManager, {
      morpho: mockLendProvider,
    })
    const invalidSigner = { type: 'invalid' } as unknown as Address
    const signers = [invalidSigner]

    await expect(provider.getWalletAddress({ signers })).rejects.toThrow(
      'invalid signer type',
    )
  })

  it('should get existing wallet', async () => {
    const provider = new DefaultSmartWalletProvider(mockChainManager, {
      morpho: mockLendProvider,
    })
    const walletAddress = getRandomAddress()

    const wallet = await provider.getWallet({
      walletAddress,
      signer: mockSigner,
      signers: [mockSigner.address],
    })

    // Verify DefaultSmartWallet.create was called with correct params
    expect(createWalletSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        signers: [mockSigner.address],
        signer: mockSigner,
        deploymentAddress: walletAddress,
      }),
    )
    expect(wallet).toBe(mockWallet)
    expect(wallet.signer).toBe(mockSigner)
    expect(wallet.address).toBeDefined()
  })

  it('passes attributionSuffix from constructor into createWallet', async () => {
    const attributionSeed = 'https://my.app'
    const expectedSuffix =
      DefaultSmartWalletProvider.computeAttributionSuffix(attributionSeed)
    const provider = new DefaultSmartWalletProvider(
      mockChainManager,
      { morpho: mockLendProvider },
      supportedAssets,
      attributionSeed,
    )

    vi.mocked(mockWallet.deploy).mockResolvedValue({
      chainId: 1,
      success: true,
      receipt: undefined,
    })

    await provider.createWallet({
      signers: [mockSigner.address],
      signer: mockSigner,
    })

    expect(createWalletSpy).toHaveBeenCalled()
    const callArg = createWalletSpy.mock.calls[0]?.[0]
    expect(callArg?.attributionSuffix).toBe(expectedSuffix)
  })

  it('passes attributionSuffix from constructor into getWallet', async () => {
    const attributionSeed = 'campaign-123'
    const expectedSuffix =
      DefaultSmartWalletProvider.computeAttributionSuffix(attributionSeed)
    const provider = new DefaultSmartWalletProvider(
      mockChainManager,
      { morpho: mockLendProvider },
      supportedAssets,
      attributionSeed,
    )

    await provider.getWallet({
      walletAddress: getRandomAddress(),
      signer: mockSigner,
      signers: [mockSigner.address],
    })

    expect(createWalletSpy).toHaveBeenCalled()
    const callArg = createWalletSpy.mock.calls[0]?.[0]
    expect(callArg?.attributionSuffix).toBe(expectedSuffix)
  })
})
