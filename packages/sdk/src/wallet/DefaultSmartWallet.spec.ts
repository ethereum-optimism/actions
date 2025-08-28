import { type Address, type LocalAccount, pad, parseUnits } from 'viem'
import { toCoinbaseSmartAccount } from 'viem/account-abstraction'
import { baseSepolia, unichain } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import { smartWalletFactoryAbi } from '@/abis/smartWalletFactory.js'
import { smartWalletFactoryAddress } from '@/constants/addresses.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { SUPPORTED_TOKENS } from '@/supported/tokens.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { getRandomAddress } from '@/test/utils.js'
import type { LendProvider, TransactionData } from '@/types/lend.js'
import { DefaultSmartWallet } from '@/wallet/DefaultSmartWallet.js'

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
const mockLendProvider: LendProvider = {
  deposit: vi.fn().mockResolvedValue({ hash: '0xabc' }),
} as unknown as LendProvider

// Test suite
describe('DefaultSmartWallet', () => {
  it('should create a smart wallet instance', () => {
    const wallet = new DefaultSmartWallet(
      mockOwners,
      mockSigner,
      mockChainManager,
      mockLendProvider,
    )
    expect(wallet).toBeInstanceOf(DefaultSmartWallet)
  })

  it('should return the correct signer', () => {
    const wallet = new DefaultSmartWallet(
      mockOwners,
      mockSigner,
      mockChainManager,
      mockLendProvider,
    )
    expect(wallet.signer).toEqual(mockSigner)
  })

  it('should get the wallet address', async () => {
    const owners = [getRandomAddress(), getRandomAddress()]
    const wallet = new DefaultSmartWallet(
      owners,
      mockSigner,
      mockChainManager,
      mockLendProvider,
    )
    const mockAddress = getRandomAddress()
    const publicClient = vi.mocked(
      mockChainManager.getPublicClient(baseSepolia.id),
    )
    publicClient.readContract = vi.fn().mockResolvedValue(mockAddress)

    const address = await wallet.getAddress()

    expect(address).toBe(mockAddress)
    expect(publicClient.readContract).toHaveBeenCalledWith({
      abi: smartWalletFactoryAbi,
      address: smartWalletFactoryAddress,
      functionName: 'getAddress',
      args: [owners.map((owner) => pad(owner)), BigInt(0)],
    })
  })

  it('should return the deployment address', async () => {
    const deploymentAddress = getRandomAddress()
    const wallet = new DefaultSmartWallet(
      mockOwners,
      mockSigner,
      mockChainManager,
      mockLendProvider,
      deploymentAddress,
    )
    const address = await wallet.getAddress()
    expect(address).toBe(deploymentAddress)
  })

  it('should call toCoinbaseSmartAccount with correct arguments', async () => {
    const deploymentAddress = getRandomAddress()
    const signerOwnerIndex = 1
    const nonce = BigInt(123)
    const wallet = new DefaultSmartWallet(
      mockOwners,
      mockSigner,
      mockChainManager,
      mockLendProvider,
      deploymentAddress,
      signerOwnerIndex,
      nonce,
    )
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
    const wallet = new DefaultSmartWallet(
      mockOwners,
      mockSigner,
      mockChainManager,
      mockLendProvider,
    )
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
    vi.mocked(bundlerClient.sendUserOperation).mockResolvedValue(
      '0xTransactionHash',
    )

    const result = await wallet.send(transactionData, chainId)

    expect(mockChainManager.getBundlerClient).toHaveBeenCalledWith(
      chainId,
      mockAccount,
    )
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledWith({
      account: mockAccount,
      calls: [transactionData],
      paymaster: true,
    })
    expect(bundlerClient.waitForUserOperationReceipt).toHaveBeenCalledWith({
      hash: '0xTransactionHash',
    })
    expect(result).toBe('0xTransactionHash')
  })

  it('should lend assets', async () => {
    const wallet = new DefaultSmartWallet(
      mockOwners,
      mockSigner,
      mockChainManager,
      mockLendProvider,
      '0x123',
    )
    const amount = 1.5
    const asset = 'USDC'
    const chainId = unichain.id
    const marketId = '0x123'
    const result = await wallet.lend(amount, asset, chainId, marketId)

    expect(mockLendProvider.deposit).toHaveBeenCalledWith(
      SUPPORTED_TOKENS[asset].addresses[chainId],
      parseUnits(amount.toString(), SUPPORTED_TOKENS[asset].decimals),
      marketId,
      {
        receiver: '0x123',
      },
    )
    expect(result.hash).toBe('0xabc')
  })
})
