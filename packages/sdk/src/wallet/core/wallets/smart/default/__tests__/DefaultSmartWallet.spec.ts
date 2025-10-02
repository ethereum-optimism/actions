import type { Address, Hex, LocalAccount } from 'viem'
import { concatHex, encodeFunctionData, pad } from 'viem'
import type {
  WaitForUserOperationReceiptReturnType,
  WebAuthnAccount,
} from 'viem/account-abstraction'
import { toCoinbaseSmartAccount } from 'viem/account-abstraction'
import { baseSepolia, unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { SUPPORTED_TOKENS } from '@/supported/tokens.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { getRandomAddress } from '@/test/utils.js'
import type {
  LendConfig,
  LendProvider,
  TransactionData,
} from '@/types/lend/index.js'
import {
  smartWalletAbi,
  smartWalletFactoryAbi,
  smartWalletFactoryAddress,
} from '@/wallet/core/wallets/smart/default/constants/index.js'
import { DefaultSmartWallet } from '@/wallet/core/wallets/smart/default/DefaultSmartWallet.js'
import { findOwnerIndex } from '@/wallet/core/wallets/smart/default/utils/findOwnerIndex.js'

import { SmartWalletDeploymentError } from '../../error/errors.js'

vi.mock('viem/account-abstraction', () => ({
  toCoinbaseSmartAccount: vi.fn(),
}))

vi.mock('@/wallet/core/wallets/smart/default/utils/findOwnerIndex.js', () => ({
  findOwnerIndex: vi.fn(),
}))

// Mock data
const mockSignerAddress = getRandomAddress()
const mockOwners: Address[] = [mockSignerAddress, getRandomAddress()]
const mockSigner: LocalAccount = {
  address: mockSignerAddress,
  type: 'local',
} as unknown as LocalAccount
const mockChainManager = new MockChainManager({
  supportedChains: [baseSepolia.id, unichain.id],
}) as unknown as ChainManager
const mockLendProvider = createMockLendProvider()

// Test suite
describe('DefaultSmartWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create a smart wallet instance', async () => {
    const wallet = await createAndInitDefaultSmartWallet()

    expect(wallet).toBeInstanceOf(DefaultSmartWallet)
  })

  it('should return the correct signer', async () => {
    const wallet = await createAndInitDefaultSmartWallet()

    expect(wallet.signer).toEqual(mockSigner)
  })

  it('should get the wallet address', async () => {
    const mockDeploymentAddress = getRandomAddress()
    const publicClient = vi.mocked(
      mockChainManager.getPublicClient(baseSepolia.id),
    )
    publicClient.readContract = vi.fn().mockResolvedValue(mockDeploymentAddress)
    const signer = {
      address: mockSignerAddress,
      type: 'local',
    } as unknown as LocalAccount
    const owners = [signer.address, getRandomAddress()]
    const wallet = await createAndInitDefaultSmartWallet({ owners, signer })

    expect(wallet.address).toBe(mockDeploymentAddress)
    expect(publicClient.readContract).toHaveBeenCalledWith({
      abi: smartWalletFactoryAbi,
      address: smartWalletFactoryAddress,
      functionName: 'getAddress',
      args: [owners.map((owner) => pad(owner)), BigInt(0)],
    })
  })

  it('should return the deployment address', async () => {
    const deploymentAddress = getRandomAddress()

    const wallet = await createAndInitDefaultSmartWallet({ deploymentAddress })

    expect(wallet.address).toBe(deploymentAddress)
  })

  it('should call toCoinbaseSmartAccount with correct arguments', async () => {
    const deploymentAddress = getRandomAddress()
    const signer = {
      address: getRandomAddress(),
      type: 'local',
    } as unknown as LocalAccount
    const owners = [getRandomAddress(), signer.address]
    const signerOwnerIndex = 1
    const nonce = BigInt(123)
    const wallet = await createAndInitDefaultSmartWallet({
      deploymentAddress,
      owners,
      signer,
      nonce,
    })

    const chainId = unichain.id
    await wallet.getCoinbaseSmartAccount(chainId)

    const toCoinbaseSmartAccountMock = vi.mocked(toCoinbaseSmartAccount)
    expect(toCoinbaseSmartAccountMock).toHaveBeenCalledWith({
      address: deploymentAddress,
      ownerIndex: signerOwnerIndex,
      client: mockChainManager.getPublicClient(chainId),
      owners: [owners[0], signer],
      nonce: nonce,
      version: '1.1',
    })
  })

  it('should send a transaction via ERC-4337', async () => {
    const attributionSuffix = '0x11111111111111111111111111111111'
    const wallet = await createAndInitDefaultSmartWallet({
      attributionSuffix,
    })

    const chainId = unichain.id
    const recipientAddress = getRandomAddress()
    const value = BigInt(1000)
    const data = '0x123'
    const transactionData: TransactionData = {
      to: recipientAddress,
      value,
      data,
    }
    const mockAccount = {
      address: '0x123',
      client: mockChainManager.getPublicClient(baseSepolia.id),
      owners: [mockSigner],
      nonce: BigInt(0),
    } as any
    vi.mocked(toCoinbaseSmartAccount).mockResolvedValue(mockAccount)
    const bundlerClient = mockChainManager.getBundlerClient(
      chainId,
      mockAccount,
    )
    // prepare returns base callData/initCode that we will append to
    vi.mocked(bundlerClient.prepareUserOperation).mockResolvedValue({
      account: mockAccount,
      callData: data,
      initCode: '0x',
    })
    vi.mocked(bundlerClient.sendUserOperation).mockResolvedValue(
      '0xTransactionHash',
    )
    const mockWaitForUserOperationReceipt = {
      success: true,
      userOpHash: '0xTransactionHash',
    } as unknown as WaitForUserOperationReceiptReturnType
    vi.mocked(bundlerClient.waitForUserOperationReceipt).mockResolvedValue(
      mockWaitForUserOperationReceipt,
    )

    const result = await wallet.send(transactionData, chainId)

    expect(mockChainManager.getBundlerClient).toHaveBeenCalledWith(
      chainId,
      mockAccount,
    )
    expect(bundlerClient.prepareUserOperation).toHaveBeenCalled()
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        account: mockAccount,
        callData: concatHex([data, attributionSuffix]),
        initCode: '0x',
        paymaster: true,
      }),
    )
    expect(bundlerClient.waitForUserOperationReceipt).toHaveBeenCalledWith({
      hash: '0xTransactionHash',
    })
    expect(result).toBe(mockWaitForUserOperationReceipt)
  })

  it('should send a batch of transactions via ERC-4337', async () => {
    const attributionSuffix = '0x22222222222222222222222222222222'
    const wallet = await createAndInitDefaultSmartWallet({
      attributionSuffix,
    })

    const chainId = unichain.id
    const recipientAddress = getRandomAddress()
    const recipientAddress2 = getRandomAddress()
    const value = BigInt(1000)
    const value2 = BigInt(2000)
    const data = '0x123'
    const data2 = '0x456'
    const transactionData: TransactionData[] = [
      {
        to: recipientAddress,
        value,
        data,
      },
      {
        to: recipientAddress2,
        value: value2,
        data: data2,
      },
    ]
    const mockAccount = {
      address: '0x123',
      client: mockChainManager.getPublicClient(baseSepolia.id),
      owners: [mockSigner],
      nonce: BigInt(0),
    } as any
    vi.mocked(toCoinbaseSmartAccount).mockResolvedValue(mockAccount)
    const bundlerClient = mockChainManager.getBundlerClient(
      chainId,
      mockAccount,
    )
    vi.mocked(bundlerClient.prepareUserOperation).mockResolvedValue({
      account: mockAccount,
      callData: '0xdeadbeef',
      initCode: '0x01',
    })
    vi.mocked(bundlerClient.sendUserOperation).mockResolvedValue(
      '0xTransactionHash',
    )
    const mockWaitForUserOperationReceipt = {
      success: true,
      userOpHash: '0xTransactionHash',
    } as unknown as WaitForUserOperationReceiptReturnType
    vi.mocked(bundlerClient.waitForUserOperationReceipt).mockResolvedValue(
      mockWaitForUserOperationReceipt,
    )

    const result = await wallet.sendBatch(transactionData, chainId)

    expect(mockChainManager.getBundlerClient).toHaveBeenCalledWith(
      chainId,
      mockAccount,
    )
    expect(bundlerClient.prepareUserOperation).toHaveBeenCalled()
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        account: mockAccount,
        callData: concatHex(['0xdeadbeef', attributionSuffix]),
        initCode: concatHex(['0x01', attributionSuffix]),
        paymaster: true,
      }),
    )
    expect(bundlerClient.waitForUserOperationReceipt).toHaveBeenCalledWith({
      hash: '0xTransactionHash',
    })
    expect(result).toBe(mockWaitForUserOperationReceipt)
  })

  it('adds an EOA owner via addOwner and returns index', async () => {
    const deploymentAddress = getRandomAddress()
    const wallet = await createAndInitDefaultSmartWallet({
      deploymentAddress,
    })

    const chainId = unichain.id
    const newSigner: Address = getRandomAddress()

    const sendBatchSpy = vi.spyOn(wallet, 'sendBatch').mockResolvedValue({
      success: true,
    } as unknown as WaitForUserOperationReceiptReturnType)

    vi.mocked(findOwnerIndex).mockResolvedValue(2)

    const resultIndex = await wallet.addSigner(newSigner, chainId)

    const expectedData = encodeFunctionData({
      abi: smartWalletAbi,
      functionName: 'addOwnerAddress',
      args: [newSigner] as const,
    })

    expect(sendBatchSpy).toHaveBeenCalledWith(
      [
        {
          to: deploymentAddress,
          data: expectedData,
          value: 0n,
        },
      ],
      chainId,
    )
    expect(findOwnerIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        address: deploymentAddress,
        signer: newSigner,
      }),
    )
    expect(resultIndex).toBe(2)
  })

  it('adds a WebAuthn owner via addOwner and returns index', async () => {
    const deploymentAddress = getRandomAddress()
    const wallet = await createAndInitDefaultSmartWallet({
      deploymentAddress,
    })

    const chainId = unichain.id
    const publicKey64Bytes: Hex =
      '0xe7575170745fe55d7a26190c6d5504743496c49498b129d2b3660da3697e81d4daebb2496f89aa4a05f1705e1d5d316153211c198f80d3100b51489bf4963f47'
    const x = ('0x' + publicKey64Bytes.slice(2, 66)) as Hex
    const y = ('0x' + publicKey64Bytes.slice(66)) as Hex
    const webAuthnOwner = {
      type: 'webAuthn',
      publicKey: publicKey64Bytes,
    } as unknown as WebAuthnAccount

    const sendBatchSpy = vi.spyOn(wallet, 'sendBatch').mockResolvedValue({
      success: true,
    } as unknown as WaitForUserOperationReceiptReturnType)

    vi.mocked(findOwnerIndex).mockResolvedValue(1)

    const resultIndex = await wallet.addSigner(webAuthnOwner, chainId)

    const expectedData = encodeFunctionData({
      abi: smartWalletAbi,
      functionName: 'addOwnerPublicKey',
      args: [x, y] as const,
    })

    expect(sendBatchSpy).toHaveBeenCalledWith(
      [
        {
          to: deploymentAddress,
          data: expectedData,
          value: 0n,
        },
      ],
      chainId,
    )
    expect(findOwnerIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        address: deploymentAddress,
        signer: {
          type: 'webAuthn',
          publicKey: publicKey64Bytes,
        } as unknown as WebAuthnAccount,
      }),
    )
    expect(resultIndex).toBe(1)
  })

  it('retries finding signer index after initial -1 with 2s backoff', async () => {
    vi.useFakeTimers()

    const deploymentAddress = getRandomAddress()
    const wallet = await createAndInitDefaultSmartWallet({
      deploymentAddress,
    })

    const chainId = unichain.id
    const newSigner: Address = getRandomAddress()

    vi.spyOn(wallet, 'sendBatch').mockResolvedValue({
      success: true,
    } as unknown as WaitForUserOperationReceiptReturnType)

    vi.mocked(findOwnerIndex).mockResolvedValueOnce(-1).mockResolvedValueOnce(4)

    const promise = wallet.addSigner(newSigner, chainId)

    await vi.advanceTimersByTimeAsync(2000)
    const resultIndex = await promise

    expect(findOwnerIndex).toHaveBeenCalledTimes(2)
    expect(resultIndex).toBe(4)

    vi.useRealTimers()
  })

  it('findSignerIndex delegates to findOwnerIndex for EOA and returns index', async () => {
    const deploymentAddress = getRandomAddress()
    const wallet = await createAndInitDefaultSmartWallet({
      deploymentAddress,
    })

    const chainId = unichain.id
    const eoa: Address = getRandomAddress()

    vi.mocked(findOwnerIndex).mockResolvedValue(7)

    const idx = await wallet.findSignerIndex(eoa, chainId)

    expect(findOwnerIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        address: deploymentAddress,
        signer: eoa,
      }),
    )
    expect(idx).toBe(7)
  })

  it('findSignerIndex delegates to findOwnerIndex for WebAuthn and returns index', async () => {
    const deploymentAddress = getRandomAddress()
    const wallet = await createAndInitDefaultSmartWallet({
      deploymentAddress,
    })

    const chainId = unichain.id
    const publicKey64Bytes: Hex =
      '0xe7575170745fe55d7a26190c6d5504743496c49498b129d2b3660da3697e81d4daebb2496f89aa4a05f1705e1d5d316153211c198f80d3100b51489bf4963f47'
    const webAuthnSigner = {
      type: 'webAuthn',
      publicKey: publicKey64Bytes,
    } as unknown as WebAuthnAccount

    vi.mocked(findOwnerIndex).mockResolvedValue(3)

    const idx = await wallet.findSignerIndex(webAuthnSigner, chainId)

    expect(findOwnerIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        address: deploymentAddress,
        signer: {
          type: 'webAuthn',
          publicKey: publicKey64Bytes,
        } as unknown as WebAuthnAccount,
      }),
    )
    expect(idx).toBe(3)
  })

  it('removes an EOA signer via removeSigner using looked-up index', async () => {
    const deploymentAddress = getRandomAddress()
    const wallet = await createAndInitDefaultSmartWallet({ deploymentAddress })

    const chainId = unichain.id
    const signer: Address = getRandomAddress()

    const sendBatchSpy = vi.spyOn(wallet, 'sendBatch').mockResolvedValue({
      success: true,
    } as unknown as WaitForUserOperationReceiptReturnType)

    const findSignerIndexSpy = vi
      .spyOn(wallet, 'findSignerIndex')
      .mockResolvedValue(5)

    const receipt = await wallet.removeSigner(signer, chainId)

    const signerBytes = pad(signer)
    const expectedData = encodeFunctionData({
      abi: smartWalletAbi,
      functionName: 'removeOwnerAtIndex',
      args: [5n, signerBytes] as const,
    })

    expect(findSignerIndexSpy).toHaveBeenCalledWith(signer, chainId)
    expect(sendBatchSpy).toHaveBeenCalledWith(
      [
        {
          to: deploymentAddress,
          data: expectedData,
          value: 0n,
        },
      ],
      chainId,
    )
    expect(receipt).toEqual({ success: true })
  })

  it('removes a WebAuthn signer via removeSigner using provided index (skips lookup)', async () => {
    const deploymentAddress = getRandomAddress()
    const wallet = await createAndInitDefaultSmartWallet({ deploymentAddress })

    const chainId = unichain.id
    const publicKey64Bytes: Hex =
      '0xe7575170745fe55d7a26190c6d5504743496c49498b129d2b3660da3697e81d4daebb2496f89aa4a05f1705e1d5d316153211c198f80d3100b51489bf4963f47'
    const webAuthnSigner = {
      type: 'webAuthn',
      publicKey: publicKey64Bytes,
    } as unknown as WebAuthnAccount

    const sendBatchSpy = vi.spyOn(wallet, 'sendBatch').mockResolvedValue({
      success: true,
    } as unknown as WaitForUserOperationReceiptReturnType)

    const findSignerIndexSpy = vi.spyOn(wallet, 'findSignerIndex')

    const receipt = await wallet.removeSigner(webAuthnSigner, chainId, 9)

    const expectedData = encodeFunctionData({
      abi: smartWalletAbi,
      functionName: 'removeOwnerAtIndex',
      args: [9n, publicKey64Bytes] as const,
    })

    expect(findSignerIndexSpy).not.toHaveBeenCalled()
    expect(sendBatchSpy).toHaveBeenCalledWith(
      [
        {
          to: deploymentAddress,
          data: expectedData,
          value: 0n,
        },
      ],
      chainId,
    )
    expect(receipt).toEqual({ success: true })
  })

  it('should have lend namespace with bound methods', async () => {
    const wallet = await createAndInitDefaultSmartWallet({
      deploymentAddress: '0x123',
    })

    // Test that lend namespace exists and is properly bound
    expect(wallet.lend).toBeDefined()
    expect(typeof wallet.lend!.getMarkets).toBe('function')
    expect(typeof wallet.lend!.supportedChainIds).toBe('function')

    // Test that lend namespace delegates to provider
    const markets = await wallet.lend!.getMarkets()
    expect(mockLendProvider.getMarkets).toHaveBeenCalled()
    expect(markets).toHaveLength(1)
    expect(markets[0].name).toBe('Mock Market')

    const chainIds = wallet.lend!.supportedChainIds()
    expect(chainIds).toContain(84532)
  })

  it('throws if attribution suffix is not valid hex', async () => {
    await expect(
      createAndInitDefaultSmartWallet({
        attributionSuffix: 'not-hex' as unknown as Hex,
      }),
    ).rejects.toThrow('Attribution suffix must be a valid hex string')
  })

  it('throws if attribution suffix is not 16 bytes', async () => {
    await expect(
      createAndInitDefaultSmartWallet({
        attributionSuffix: '0x1234' as Hex,
      }),
    ).rejects.toThrow('Attribution suffix must be 16 bytes (0x + 32 hex chars)')
  })

  it('throws if attribution suffix is longer than 16 bytes', async () => {
    const tooLong: Hex = ('0x' + '11'.repeat(17)) as Hex
    await expect(
      createAndInitDefaultSmartWallet({ attributionSuffix: tooLong }),
    ).rejects.toThrow('Attribution suffix must be 16 bytes (0x + 32 hex chars)')
  })

  describe('deploy', () => {
    it('should deploy wallet successfully when not already deployed', async () => {
      const signer = {
        address: getRandomAddress(),
        type: 'local',
      } as unknown as LocalAccount
      const owners = [signer.address, getRandomAddress()]
      const deploymentAddress = getRandomAddress()
      const nonce = BigInt(123)
      const wallet = await createAndInitDefaultSmartWallet({
        owners,
        signer,
        deploymentAddress,
        nonce,
      })

      const chainId = unichain.id
      const mockAccount = {
        address: deploymentAddress,
        isDeployed: vi.fn().mockResolvedValue(false),
      } as unknown as Awaited<ReturnType<typeof toCoinbaseSmartAccount>>

      vi.mocked(toCoinbaseSmartAccount).mockResolvedValue(mockAccount)

      const mockReceipt = {
        success: true,
        userOpHash: '0xabc',
      } as unknown as WaitForUserOperationReceiptReturnType

      const sendBatchSpy = vi
        .spyOn(wallet, 'sendBatch')
        .mockResolvedValue(mockReceipt)

      const result = await wallet.deploy(chainId)

      expect(mockAccount.isDeployed).toHaveBeenCalled()
      expect(sendBatchSpy).toHaveBeenCalledWith(
        [
          {
            to: smartWalletFactoryAddress,
            value: 0n,
            data: encodeFunctionData({
              abi: smartWalletFactoryAbi,
              functionName: 'createAccount',
              args: [owners.map((owner) => pad(owner)), nonce],
            }),
          },
        ],
        chainId,
      )
      expect(result).toEqual({
        chainId,
        success: true,
        receipt: mockReceipt,
      })
    })

    it('should return success without deploying when wallet is already deployed', async () => {
      const deploymentAddress = getRandomAddress()
      const wallet = await createAndInitDefaultSmartWallet({
        deploymentAddress,
      })

      const chainId = baseSepolia.id
      const mockAccount = {
        address: deploymentAddress,
        isDeployed: vi.fn().mockResolvedValue(true),
      } as unknown as Awaited<ReturnType<typeof toCoinbaseSmartAccount>>

      vi.mocked(toCoinbaseSmartAccount).mockResolvedValue(mockAccount)

      const sendBatchSpy = vi.spyOn(wallet, 'sendBatch')

      const result = await wallet.deploy(chainId)

      expect(mockAccount.isDeployed).toHaveBeenCalled()
      expect(sendBatchSpy).not.toHaveBeenCalled()
      expect(result).toEqual({
        chainId,
        success: true,
        receipt: undefined,
      })
    })

    it('should throw SmartWalletDeploymentError when receipt.success is false', async () => {
      const deploymentAddress = getRandomAddress()
      const wallet = await createAndInitDefaultSmartWallet({
        deploymentAddress,
      })

      const chainId = unichain.id
      const mockAccount = {
        address: deploymentAddress,
        isDeployed: vi.fn().mockResolvedValue(false),
      } as unknown as Awaited<ReturnType<typeof toCoinbaseSmartAccount>>

      vi.mocked(toCoinbaseSmartAccount).mockResolvedValue(mockAccount)

      const mockReceipt = {
        success: false,
        userOpHash: '0xfailed',
      } as unknown as WaitForUserOperationReceiptReturnType

      vi.spyOn(wallet, 'sendBatch').mockResolvedValue(mockReceipt)

      await expect(wallet.deploy(chainId)).rejects.toThrow(
        new SmartWalletDeploymentError(
          'Failed to deploy smart wallet: deployment transaction reverted',
          chainId,
          mockReceipt,
        ),
      )
    })

    it('should throw SmartWalletDeploymentError when sendBatch throws', async () => {
      const deploymentAddress = getRandomAddress()
      const wallet = await createAndInitDefaultSmartWallet({
        deploymentAddress,
      })

      const chainId = baseSepolia.id
      const mockAccount = {
        address: deploymentAddress,
        isDeployed: vi.fn().mockResolvedValue(false),
      } as unknown as Awaited<ReturnType<typeof toCoinbaseSmartAccount>>

      vi.mocked(toCoinbaseSmartAccount).mockResolvedValue(mockAccount)

      const sendBatchError = new Error('Network error')
      vi.spyOn(wallet, 'sendBatch').mockRejectedValue(sendBatchError)

      await expect(wallet.deploy(chainId)).rejects.toThrow(
        new SmartWalletDeploymentError(
          'Failed to deploy smart wallet: Network error',
          chainId,
        ),
      )
    })

    it('should pass correct chainId to sendBatch', async () => {
      const signer = {
        address: getRandomAddress(),
        type: 'local',
      } as unknown as LocalAccount
      const owners = [signer.address]
      const deploymentAddress = getRandomAddress()
      const nonce = BigInt(456)
      const wallet = await createAndInitDefaultSmartWallet({
        owners,
        signer,
        deploymentAddress,
        nonce,
      })

      const chainId = baseSepolia.id
      const mockAccount = {
        address: deploymentAddress,
        isDeployed: vi.fn().mockResolvedValue(false),
      } as unknown as Awaited<ReturnType<typeof toCoinbaseSmartAccount>>

      vi.mocked(toCoinbaseSmartAccount).mockResolvedValue(mockAccount)

      const mockReceipt = {
        success: true,
        userOpHash: '0xdef',
      } as unknown as WaitForUserOperationReceiptReturnType

      const sendBatchSpy = vi
        .spyOn(wallet, 'sendBatch')
        .mockResolvedValue(mockReceipt)

      await wallet.deploy(chainId)

      expect(sendBatchSpy).toHaveBeenCalledWith(
        [
          {
            to: smartWalletFactoryAddress,
            value: 0n,
            data: encodeFunctionData({
              abi: smartWalletFactoryAbi,
              functionName: 'createAccount',
              args: [owners.map((owner) => pad(owner)), nonce],
            }),
          },
        ],
        chainId,
      )
      expect(sendBatchSpy).toHaveBeenCalledTimes(1)
    })
  })
})

async function createAndInitDefaultSmartWallet(
  params: {
    owners?: Address[]
    signer?: LocalAccount
    chainManager?: ChainManager
    lendProvider?: LendProvider<LendConfig>
    deploymentAddress?: Address
    nonce?: bigint
    attributionSuffix?: Hex
  } = {},
) {
  const {
    owners = mockOwners,
    signer = mockSigner,
    chainManager = mockChainManager,
    lendProvider = mockLendProvider,
    deploymentAddress,
    nonce,
    attributionSuffix,
  } = params
  return DefaultSmartWallet.create({
    owners,
    signer,
    chainManager,
    lendProvider,
    deploymentAddress,
    nonce,
    attributionSuffix,
  })
}
