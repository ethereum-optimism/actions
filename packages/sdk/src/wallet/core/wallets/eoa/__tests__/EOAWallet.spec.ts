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

import { getRandomAddress } from '@/__mocks__/utils.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
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
    super({
      chainManager,
      actionProviders: {},
      actionSettings: {},
    })
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
      expect(callArgs.account).toMatchObject({
        address: mockLocalAccount.address,
      })
      expect(callArgs.chain).toBe(unichain)
      expect(walletClient).toBe(mockWalletClient)
    })

    it('attaches a nonce manager so back-to-back sends get sequential nonces', async () => {
      await wallet.walletClient(unichain.id)

      const callArgs = vi.mocked(createWalletClient).mock.calls[0][0]
      const account = callArgs.account as { nonceManager?: unknown }
      expect(account.nonceManager).toMatchObject({
        consume: expect.any(Function),
        increment: expect.any(Function),
        get: expect.any(Function),
        reset: expect.any(Function),
      })
    })

    it('respects a nonce manager already set on the signer', async () => {
      const customNonceManager = {
        consume: vi.fn(),
        increment: vi.fn(),
        get: vi.fn(),
        reset: vi.fn(),
      }
      ;(mockLocalAccount as LocalAccount).nonceManager =
        customNonceManager as unknown as LocalAccount['nonceManager']

      await wallet.walletClient(unichain.id)

      const callArgs = vi.mocked(createWalletClient).mock.calls[0][0]
      const account = callArgs.account as { nonceManager?: unknown }
      expect(account.nonceManager).toBe(customNonceManager)

      delete (mockLocalAccount as LocalAccount).nonceManager
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

      // sendBatch performs exactly one inclusion wait per transaction. One
      // mock per tx.
      vi.mocked(mockPublicClient.waitForTransactionReceipt)
        .mockResolvedValueOnce(mockReceipt)
        .mockResolvedValueOnce(mockReceipt2)
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

    it('waits for exactly one confirmation per transaction', async () => {
      await wallet.sendBatch(
        [mockTransactionData1, mockTransactionData2],
        unichain.id,
      )

      // One inclusion wait per tx.
      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledTimes(
        2,
      )
      expect(
        mockPublicClient.waitForTransactionReceipt,
      ).not.toHaveBeenCalledWith(expect.objectContaining({ confirmations: 2 }))
    })

    it('reuses a single wallet client and public client for the whole batch', async () => {
      const createWalletClientCalls =
        vi.mocked(createWalletClient).mock.calls.length

      await wallet.sendBatch(
        [mockTransactionData1, mockTransactionData2, mockTransactionData3],
        unichain.id,
      )

      // The batch builds the wallet client once and resolves the public client
      // once, rather than per-transaction.
      expect(vi.mocked(createWalletClient).mock.calls.length).toBe(
        createWalletClientCalls + 1,
      )
      expect(mockChainManager.getPublicClient).toHaveBeenCalledTimes(1)
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

    it('broadcasts sequentially: tx N+1 is not submitted until tx N resolves', async () => {
      const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
      const hashes = [
        mockReceipt.transactionHash,
        mockReceipt2.transactionHash,
        mockReceipt3.transactionHash,
      ]
      const gates = hashes.map(() => {
        let resolve!: () => void
        const promise = new Promise<void>((r) => {
          resolve = r
        })
        return { promise, resolve }
      })
      let sendIndex = 0
      vi.mocked(mockWalletClient.sendTransaction).mockReset()
      vi.mocked(mockWalletClient.sendTransaction).mockImplementation(
        (async () => {
          const i = sendIndex++
          await gates[i].promise
          return hashes[i]
        }) as typeof mockWalletClient.sendTransaction,
      )

      const pending = wallet.sendBatch(
        [mockTransactionData1, mockTransactionData2, mockTransactionData3],
        unichain.id,
      )

      await flush()
      // Only the first broadcast has started; the loop is awaiting it.
      expect(mockWalletClient.sendTransaction).toHaveBeenCalledTimes(1)

      gates[0].resolve()
      await flush()
      expect(mockWalletClient.sendTransaction).toHaveBeenCalledTimes(2)

      gates[1].resolve()
      await flush()
      expect(mockWalletClient.sendTransaction).toHaveBeenCalledTimes(3)

      gates[2].resolve()
      const receipts = await pending
      expect(receipts).toHaveLength(3)
    })

    it('waits for receipts in parallel', async () => {
      // Each wait only resolves once all three have been issued. If the
      // implementation awaited one receipt before requesting the next, the
      // count would stall at 1 and this test would hang.
      let releaseAll!: () => void
      const allIssued = new Promise<void>((resolve) => {
        releaseAll = resolve
      })
      let issued = 0
      const receiptByHash: Record<string, EOATransactionReceipt> = {
        [mockReceipt.transactionHash]: mockReceipt,
        [mockReceipt2.transactionHash]: mockReceipt2,
        [mockReceipt3.transactionHash]: mockReceipt3,
      }
      vi.mocked(mockPublicClient.waitForTransactionReceipt).mockReset()
      vi.mocked(mockPublicClient.waitForTransactionReceipt).mockImplementation(
        (async ({ hash }: { hash: Hex }) => {
          issued += 1
          if (issued === 3) releaseAll()
          await allIssued
          return receiptByHash[hash]
        }) as typeof mockPublicClient.waitForTransactionReceipt,
      )

      const receipts = await wallet.sendBatch(
        [mockTransactionData1, mockTransactionData2, mockTransactionData3],
        unichain.id,
      )

      expect(issued).toBe(3)
      expect(receipts).toHaveLength(3)
    })

    it('returns receipts in input order even when waits resolve out of order', async () => {
      const receiptByHash: Record<string, EOATransactionReceipt> = {
        [mockReceipt.transactionHash]: mockReceipt,
        [mockReceipt2.transactionHash]: mockReceipt2,
        [mockReceipt3.transactionHash]: mockReceipt3,
      }
      // Resolve the later txs' receipts before the earlier ones.
      const delayByHash: Record<string, number> = {
        [mockReceipt.transactionHash]: 30,
        [mockReceipt2.transactionHash]: 10,
        [mockReceipt3.transactionHash]: 0,
      }
      vi.mocked(mockPublicClient.waitForTransactionReceipt).mockReset()
      vi.mocked(mockPublicClient.waitForTransactionReceipt).mockImplementation(
        (async ({ hash }: { hash: Hex }) => {
          await new Promise((resolve) => setTimeout(resolve, delayByHash[hash]))
          return receiptByHash[hash]
        }) as typeof mockPublicClient.waitForTransactionReceipt,
      )

      const receipts = await wallet.sendBatch(
        [mockTransactionData1, mockTransactionData2, mockTransactionData3],
        unichain.id,
      )

      expect(receipts[0].transactionHash).toBe(mockReceipt.transactionHash)
      expect(receipts[1].transactionHash).toBe(mockReceipt2.transactionHash)
      expect(receipts[2].transactionHash).toBe(mockReceipt3.transactionHash)
    })

    it('rejects the batch and stops broadcasting when a send throws', async () => {
      vi.mocked(mockWalletClient.sendTransaction).mockReset()
      vi.mocked(mockWalletClient.sendTransaction)
        .mockResolvedValueOnce(mockReceipt.transactionHash)
        .mockRejectedValueOnce(new Error('insufficient funds'))

      await expect(
        wallet.sendBatch(
          [mockTransactionData1, mockTransactionData2, mockTransactionData3],
          unichain.id,
        ),
      ).rejects.toThrow('insufficient funds')

      // Broadcast halts at the failing tx: the first two are attempted, the
      // third is never sent.
      expect(mockWalletClient.sendTransaction).toHaveBeenCalledTimes(2)
    })
  })
})
