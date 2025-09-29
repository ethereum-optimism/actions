import type { Address, Hex, LocalAccount } from 'viem'
import { concatHex, pad } from 'viem'
import { toCoinbaseSmartAccount } from 'viem/account-abstraction'
import { baseSepolia, unichain } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import { smartWalletFactoryAbi } from '@/abis/smartWalletFactory.js'
import { smartWalletFactoryAddress } from '@/constants/addresses.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { SUPPORTED_TOKENS } from '@/supported/tokens.js'
import { MockUSDCAsset } from '@/test/MockAssets.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { getRandomAddress } from '@/test/utils.js'
import type { LendConfig, LendProvider, TransactionData } from '@/types/lend.js'
import { DefaultSmartWallet } from '@/wallet/core/wallets/smart/default/DefaultSmartWallet.js'

vi.mock('viem/account-abstraction', () => ({
  toCoinbaseSmartAccount: vi.fn(),
}))

// Mock data
const mockOwners: Address[] = ['0x123', '0x456']
const mockSigner: LocalAccount = {
  address: '0x123',
  type: 'local',
} as unknown as LocalAccount
const mockChainManager = new MockChainManager({
  supportedChains: [baseSepolia.id, unichain.id],
}) as unknown as ChainManager
const mockLendProvider = createMockLendProvider()

// Test suite
describe('DefaultSmartWallet', () => {
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
    const owners = [getRandomAddress(), getRandomAddress()]
    const wallet = await createAndInitDefaultSmartWallet({ owners })

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
    const signerOwnerIndex = 1
    const nonce = BigInt(123)
    const wallet = await createAndInitDefaultSmartWallet({
      deploymentAddress,
      signerOwnerIndex,
      nonce,
    })

    const chainId = unichain.id
    await wallet.getCoinbaseSmartAccount(chainId)

    const toCoinbaseSmartAccountMock = vi.mocked(toCoinbaseSmartAccount)
    expect(toCoinbaseSmartAccountMock).toHaveBeenCalledWith({
      address: deploymentAddress,
      ownerIndex: signerOwnerIndex,
      client: mockChainManager.getPublicClient(chainId),
      owners: [wallet.signer],
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
    expect(result).toBe('0xTransactionHash')
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
    expect(result).toBe('0xTransactionHash')
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

  it('should lend assets using lendExecute method', async () => {
    // Configure mock to return transaction with hash
    mockLendProvider.configureMock({
      lendResponse: {
        amount: 100000000n,
        asset: MockUSDCAsset.address[unichain.id] as Address,
        marketId: 'test-market',
        apy: 0.05,
        timestamp: Date.now(),
        hash: '0xabc',
        transactionData: {
          deposit: {
            to: '0x123' as Address,
            data: '0x' as Hex,
            value: 0n,
          },
        },
      },
    })

    const wallet = await createAndInitDefaultSmartWallet({
      deploymentAddress: '0x123' as Address,
    })

    const result = await wallet.lendExecute(
      100,
      MockUSDCAsset,
      unichain.id,
      'test-market',
    )

    expect(mockLendProvider.deposit).toHaveBeenCalled()
    expect(result.hash).toBe('0xabc')
    expect(result.amount).toBe(100000000n) // 100 USDC with 6 decimals
  })
})

async function createAndInitDefaultSmartWallet(
  params: {
    owners?: Address[]
    signer?: LocalAccount
    chainManager?: ChainManager
    lendProvider?: LendProvider<LendConfig>
    deploymentAddress?: Address
    signerOwnerIndex?: number
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
    signerOwnerIndex,
    nonce,
    attributionSuffix,
  } = params
  return DefaultSmartWallet.create({
    owners,
    signer,
    chainManager,
    lendProvider,
    deploymentAddress,
    signerOwnerIndex,
    nonce,
    attributionSuffix,
  })
}
