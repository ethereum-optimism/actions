import type {
  Address,
  Chain,
  Hex,
  LocalAccount,
  PublicClient,
  WalletClient,
} from 'viem'
import { createWalletClient } from 'viem'
import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { getRandomAddress } from '@/test/utils.js'
import type { TransactionData } from '@/types/lend/index.js'
import type { EOATransactionReceipt } from '@/wallet/core/wallets/abstract/types/index.js'
import { EOAWallet } from '@/wallet/core/wallets/eoa/EOAWallet.js'

vi.mock('viem', async () => ({
  // @ts-ignore - importActual returns unknown
  ...(await vi.importActual('viem')),
  createWalletClient: vi.fn(),
}))

// Concrete implementation for testing abstract class
class TestEOAWallet extends EOAWallet {
  public readonly address: Address
  public readonly signer: LocalAccount

  constructor(
    address: Address,
    signer: LocalAccount,
    chainManager: ChainManager,
  ) {
    super(chainManager)
    this.address = address
    this.signer = signer
  }

  static async create(
    address: Address,
    signer: LocalAccount,
    chainManager: ChainManager,
  ): Promise<TestEOAWallet> {
    const wallet = new TestEOAWallet(address, signer, chainManager)
    await wallet.initialize()
    return wallet
  }
}

const mockAddress = getRandomAddress()
const mockChainManager = new MockChainManager({
  supportedChains: [130], // Unichain
}) as unknown as ChainManager

const mockLocalAccount = {
  address: mockAddress,
  signMessage: vi.fn(),
  sign: vi.fn(),
  signTransaction: vi.fn(),
  signTypedData: vi.fn(),
} as unknown as LocalAccount

const mockTransactionHash: Hex =
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

const mockReceipt: EOATransactionReceipt = {
  transactionHash: mockTransactionHash,
  blockNumber: 12345n,
  status: 'success',
  from: mockAddress,
  to: getRandomAddress(),
  gasUsed: 21000n,
} as EOATransactionReceipt

describe('EOAWallet', () => {
  let wallet: TestEOAWallet
  let mockWalletClient: WalletClient
  let mockPublicClient: PublicClient

  beforeEach(async () => {
    vi.clearAllMocks()

    // Setup mock wallet client
    mockWalletClient = {
      sendTransaction: vi.fn().mockResolvedValue(mockTransactionHash),
    } as unknown as WalletClient

    // Setup mock public client
    mockPublicClient = {
      waitForTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
    } as unknown as PublicClient

    // Mock chainManager methods
    vi.spyOn(mockChainManager, 'getChain').mockReturnValue(
      unichain as unknown as Chain,
    )
    vi.spyOn(mockChainManager, 'getRpcUrls').mockReturnValue([
      'https://rpc1.example.com',
      'https://rpc2.example.com',
    ])
    vi.spyOn(mockChainManager, 'getPublicClient').mockReturnValue(
      mockPublicClient,
    )

    // Mock createWalletClient
    vi.mocked(createWalletClient).mockResolvedValue(mockWalletClient)

    wallet = await TestEOAWallet.create(
      mockAddress,
      mockLocalAccount,
      mockChainManager,
    )
  })

  describe('walletClient', () => {
    it('should create a wallet client with correct configuration', async () => {
      const walletClient = await wallet.walletClient(unichain.id)

      expect(createWalletClient).toHaveBeenCalledOnce()
      const callArgs = vi.mocked(createWalletClient).mock.calls[0][0]
      expect(callArgs.account).toBe(mockLocalAccount)
      expect(callArgs.chain).toBe(unichain)
      expect(walletClient).toBe(mockWalletClient)
    })
  })

  describe('send', () => {
    const mockTransactionData: TransactionData = {
      to: getRandomAddress(),
      value: 1000000000000000000n, // 1 ETH
      data: '0x',
    }

    it('should send a transaction and return receipt', async () => {
      const receipt = await wallet.send(mockTransactionData, unichain.id)

      expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith(
        mockTransactionData,
      )
      expect(mockChainManager.getPublicClient).toHaveBeenCalledWith(unichain.id)
      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
        hash: mockTransactionHash,
      })
      expect(receipt).toBe(mockReceipt)
    })

    it('should create wallet client with correct chain', async () => {
      await wallet.send(mockTransactionData, unichain.id)

      expect(mockChainManager.getChain).toHaveBeenCalledWith(unichain.id)
      expect(createWalletClient).toHaveBeenCalled()
    })
  })

  describe('sendBatch', () => {
    const mockTransactionData1: TransactionData = {
      to: getRandomAddress(),
      value: 1000000000000000000n,
      data: '0x',
    }

    const mockTransactionData2: TransactionData = {
      to: getRandomAddress(),
      value: 2000000000000000000n,
      data: '0xabcd',
    }

    const mockTransactionData3: TransactionData = {
      to: getRandomAddress(),
      value: 3000000000000000000n,
      data: '0x1234',
    }

    const mockReceipt2: EOATransactionReceipt = {
      ...mockReceipt,
      transactionHash:
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex,
    }

    const mockReceipt3: EOATransactionReceipt = {
      ...mockReceipt,
      transactionHash:
        '0x9876543210987654321098765432109876543210987654321098765432109876' as Hex,
    }

    beforeEach(() => {
      vi.mocked(mockWalletClient.sendTransaction)
        .mockResolvedValueOnce(mockReceipt.transactionHash)
        .mockResolvedValueOnce(mockReceipt2.transactionHash)
        .mockResolvedValueOnce(mockReceipt3.transactionHash)

      vi.mocked(mockPublicClient.waitForTransactionReceipt)
        .mockResolvedValueOnce(mockReceipt)
        .mockResolvedValueOnce(mockReceipt)
        .mockResolvedValueOnce(mockReceipt2)
        .mockResolvedValueOnce(mockReceipt2)
        .mockResolvedValueOnce(mockReceipt3)
        .mockResolvedValueOnce(mockReceipt3)
    })

    it('should send multiple transactions sequentially', async () => {
      const receipts = await wallet.sendBatch(
        [mockTransactionData1, mockTransactionData2, mockTransactionData3],
        unichain.id,
      )

      expect(receipts).toHaveLength(3)
      expect(receipts[0]).toBe(mockReceipt)
      expect(receipts[1]).toBe(mockReceipt2)
      expect(receipts[2]).toBe(mockReceipt3)

      expect(mockWalletClient.sendTransaction).toHaveBeenCalledTimes(3)
      expect(mockWalletClient.sendTransaction).toHaveBeenNthCalledWith(
        1,
        mockTransactionData1,
      )
      expect(mockWalletClient.sendTransaction).toHaveBeenNthCalledWith(
        2,
        mockTransactionData2,
      )
      expect(mockWalletClient.sendTransaction).toHaveBeenNthCalledWith(
        3,
        mockTransactionData3,
      )
    })

    it('should wait for extra confirmations after each transaction', async () => {
      await wallet.sendBatch(
        [mockTransactionData1, mockTransactionData2],
        unichain.id,
      )

      // Should be called twice per transaction:
      // 1. Initial wait in send()
      // 2. Extra confirmation wait (confirmations: 2) in sendBatch()
      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledTimes(
        4,
      )

      // Check that extra confirmation wait was called with confirmations: 2
      expect(
        mockPublicClient.waitForTransactionReceipt,
      ).toHaveBeenNthCalledWith(2, {
        hash: mockReceipt.transactionHash,
        confirmations: 2,
      })

      expect(
        mockPublicClient.waitForTransactionReceipt,
      ).toHaveBeenNthCalledWith(4, {
        hash: mockReceipt2.transactionHash,
        confirmations: 2,
      })
    })

    it('should get public client for each transaction', async () => {
      await wallet.sendBatch(
        [mockTransactionData1, mockTransactionData2],
        unichain.id,
      )

      // Called twice per transaction (once in send, once for extra confirmation)
      expect(mockChainManager.getPublicClient).toHaveBeenCalledTimes(4)
      expect(mockChainManager.getPublicClient).toHaveBeenCalledWith(unichain.id)
    })

    it('should handle single transaction in batch', async () => {
      const receipts = await wallet.sendBatch(
        [mockTransactionData1],
        unichain.id,
      )

      expect(receipts).toHaveLength(1)
      expect(receipts[0]).toBe(mockReceipt)
      expect(mockWalletClient.sendTransaction).toHaveBeenCalledOnce()
    })

    it('should return empty array for empty batch', async () => {
      const receipts = await wallet.sendBatch([], unichain.id)

      expect(receipts).toEqual([])
      expect(mockWalletClient.sendTransaction).not.toHaveBeenCalled()
    })

    it('should maintain transaction order in results', async () => {
      const receipts = await wallet.sendBatch(
        [mockTransactionData1, mockTransactionData2, mockTransactionData3],
        unichain.id,
      )

      // Verify order is preserved
      expect(receipts[0].transactionHash).toBe(mockReceipt.transactionHash)
      expect(receipts[1].transactionHash).toBe(mockReceipt2.transactionHash)
      expect(receipts[2].transactionHash).toBe(mockReceipt3.transactionHash)
    })
  })
})
