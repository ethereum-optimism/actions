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
import { type WebAuthnAccount } from 'viem/account-abstraction'
import { describe, expect, it, vi } from 'vitest'

import { smartWalletFactoryAbi } from '@/abis/smartWalletFactory.js'
import { smartWalletFactoryAddress } from '@/constants/addresses.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { getRandomAddress } from '@/test/utils.js'
import { DefaultSmartWallet } from '@/wallet/DefaultSmartWallet.js'
import { DefaultSmartWalletProvider } from '@/wallet/providers/DefaultSmartWalletProvider.js'

const mockChainManager = new MockChainManager({
  supportedChains: [1, 130],
}) as unknown as ChainManager
const mockLendProvider = createMockLendProvider()
const mockSigner: LocalAccount = {
  address: getRandomAddress(),
  type: 'local',
} as unknown as LocalAccount

describe('DefaultSmartWalletProvider', () => {
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

  it('should create a wallet with correct parameters', async () => {
    const provider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const owners = [getRandomAddress(), getRandomAddress()]
    const nonce = BigInt(123)

    const wallet = await provider.createWallet({
      owners,
      signer: mockSigner,
      nonce,
    })

    expect(wallet).toBeInstanceOf(DefaultSmartWallet)
    expect(wallet.signer).toBe(mockSigner)
  })

  it('should get wallet address with correct contract call', async () => {
    const provider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const owners = [getRandomAddress(), getRandomAddress()]
    const nonce = BigInt(456)
    const mockAddress = getRandomAddress()

    const publicClient = vi.mocked(mockChainManager.getPublicClient(1))
    publicClient.readContract = vi.fn().mockResolvedValue(mockAddress)

    const address = await provider.getWalletAddress({ owners, nonce })

    expect(address).toBe(mockAddress)
    expect(publicClient.readContract).toHaveBeenCalledWith({
      abi: smartWalletFactoryAbi,
      address: smartWalletFactoryAddress,
      functionName: 'getAddress',
      args: [owners.map((owner) => pad(owner)), nonce],
    })
  })

  it('should get wallet address with default nonce', async () => {
    const provider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const owners = [getRandomAddress()]
    const mockAddress = getRandomAddress()

    const publicClient = vi.mocked(mockChainManager.getPublicClient(1))
    publicClient.readContract = vi.fn().mockResolvedValue(mockAddress)

    const address = await provider.getWalletAddress({ owners })

    expect(address).toBe(mockAddress)
    expect(publicClient.readContract).toHaveBeenCalledWith({
      abi: smartWalletFactoryAbi,
      address: smartWalletFactoryAddress,
      functionName: 'getAddress',
      args: [owners.map((owner) => pad(owner)), BigInt(0)],
    })
  })

  it('should handle WebAuthn accounts in wallet address calculation', async () => {
    const provider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const webAuthnAccount: WebAuthnAccount = {
      type: 'webAuthn',
      publicKey: '0x123456789abcdef',
    } as unknown as WebAuthnAccount
    const owners = [getRandomAddress(), webAuthnAccount]
    const mockAddress = getRandomAddress()

    const publicClient = vi.mocked(mockChainManager.getPublicClient(1))
    publicClient.readContract = vi.fn().mockResolvedValue(mockAddress)

    const address = await provider.getWalletAddress({ owners })

    expect(address).toBe(mockAddress)
    expect(publicClient.readContract).toHaveBeenCalledWith({
      abi: smartWalletFactoryAbi,
      address: smartWalletFactoryAddress,
      functionName: 'getAddress',
      args: [[pad(owners[0] as Address), webAuthnAccount.publicKey], BigInt(0)],
    })
  })

  it('should throw error for invalid owner type', async () => {
    const provider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const invalidOwner = { type: 'invalid' } as any
    const owners = [invalidOwner]

    await expect(provider.getWalletAddress({ owners })).rejects.toThrow(
      'invalid owner type',
    )
  })

  it('should get existing wallet', async () => {
    const provider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
    )
    const walletAddress = getRandomAddress()
    const ownerIndex = 2

    const wallet = await provider.getWallet({
      walletAddress,
      signer: mockSigner,
      ownerIndex,
    })

    expect(wallet).toBeInstanceOf(DefaultSmartWallet)
    expect(wallet.signer).toBe(mockSigner)
    expect(wallet.address).toBe(walletAddress)
  })

  it('passes attributionSuffix from constructor into createWallet', async () => {
    const attributionSeed = 'https://my.app'
    const expectedSuffix =
      DefaultSmartWalletProvider.computeAttributionSuffix(attributionSeed)
    const provider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
      attributionSeed,
    )
    const spy = vi
      .spyOn(DefaultSmartWallet, 'create')
      .mockResolvedValue({} as unknown as DefaultSmartWallet)

    await provider.createWallet({
      owners: [getRandomAddress()],
      signer: mockSigner,
    })

    expect(spy).toHaveBeenCalled()
    const callArg = spy.mock.calls[0][0]
    expect(callArg.attributionSuffix).toBe(expectedSuffix)

    spy.mockRestore()
  })

  it('passes attributionSuffix from constructor into getWallet', async () => {
    const attributionSeed = 'campaign-123'
    const expectedSuffix =
      DefaultSmartWalletProvider.computeAttributionSuffix(attributionSeed)
    const provider = new DefaultSmartWalletProvider(
      mockChainManager,
      mockLendProvider,
      attributionSeed,
    )
    const spy = vi
      .spyOn(DefaultSmartWallet, 'create')
      .mockResolvedValue({} as unknown as DefaultSmartWallet)

    await provider.getWallet({
      walletAddress: getRandomAddress(),
      signer: mockSigner,
    })

    expect(spy).toHaveBeenCalled()
    const callArg = spy.mock.calls[0][0]
    expect(callArg.attributionSuffix).toBe(expectedSuffix)

    spy.mockRestore()
  })
})
