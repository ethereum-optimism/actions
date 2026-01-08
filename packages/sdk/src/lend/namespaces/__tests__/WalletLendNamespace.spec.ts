import type { Address } from 'viem'
import type { WaitForUserOperationReceiptReturnType } from 'viem/account-abstraction'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getRandomAddress } from '@/__mocks__/utils.js'
import type { MockLendProvider } from '@/lend/__mocks__/MockLendProvider.js'
import { createMockLendProvider } from '@/lend/__mocks__/MockLendProvider.js'
import { WalletLendNamespace } from '@/lend/namespaces/WalletLendNamespace.js'
import type { TransactionData } from '@/types/lend/index.js'
import { createMock as createSmartWalletMock } from '@/wallet/core/wallets/smart/abstract/__mocks__/SmartWallet.js'
import type { SmartWallet } from '@/wallet/core/wallets/smart/abstract/SmartWallet.js'

describe('WalletLendNamespace', () => {
  const mockWalletAddress = getRandomAddress()
  let mockProvider: MockLendProvider
  let mockWallet: SmartWallet
  let mockMarketId: { address: Address; chainId: 130 }

  beforeEach(() => {
    // Create a consistent market ID for all tests
    mockMarketId = { address: getRandomAddress(), chainId: 130 as const }

    // Create mock provider with the market in its allowlist
    mockProvider = createMockLendProvider({
      marketAllowlist: [
        {
          address: mockMarketId.address,
          chainId: mockMarketId.chainId,
          name: 'Test Market',
          asset: {
            address: { 130: getRandomAddress() },
            metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
            type: 'erc20' as const,
          },
          lendProvider: 'morpho',
        },
      ],
    })

    // Create a mock SmartWallet with send and sendBatch methods
    mockWallet = createSmartWalletMock({
      address: mockWalletAddress,
      sendImpl: async () =>
        ({
          receipt: { success: true },
          userOpHash: '0xmockhash',
        }) as unknown as WaitForUserOperationReceiptReturnType,
      sendBatchImpl: async () =>
        ({
          receipt: { success: true },
          userOpHash: '0xmockbatchhash',
        }) as unknown as WaitForUserOperationReceiptReturnType,
    }) as unknown as SmartWallet
  })

  it('should create an instance with a lend provider and wallet', () => {
    const namespace = new WalletLendNamespace(
      { morpho: mockProvider },
      mockWallet,
    )

    expect(namespace).toBeInstanceOf(WalletLendNamespace)
  })

  it('should inherit read operations from ActionsLendNamespace', async () => {
    const namespace = new WalletLendNamespace(
      { morpho: mockProvider },
      mockWallet,
    )
    const mockMarkets = [
      {
        marketId: {
          chainId: 130 as const,
          address: getRandomAddress(),
        },
        name: 'Test Vault',
        asset: {
          address: { 130: getRandomAddress() },
          metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
          type: 'erc20' as const,
        },
        supply: {
          totalAssets: BigInt('1000000'),
          totalShares: BigInt('1000000'),
        },
        apy: {
          total: 0.05,
          native: 0.04,
          totalRewards: 0.01,
          performanceFee: 0.0,
        },
        metadata: {
          owner: getRandomAddress(),
          curator: getRandomAddress(),
          fee: 0.1,
          lastUpdate: Date.now(),
        },
      },
    ]

    vi.mocked(mockProvider.getMarkets).mockResolvedValue(mockMarkets)

    const result = await namespace.getMarkets()

    expect(mockProvider.getMarkets).toHaveBeenCalled()
    expect(result).toStrictEqual(mockMarkets)
  })

  describe('openPosition', () => {
    it('should call provider openPosition with wallet address as receiver', async () => {
      const namespace = new WalletLendNamespace(
        { morpho: mockProvider },
        mockWallet,
      )
      const mockAsset = {
        address: { 130: getRandomAddress() },
        metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        type: 'erc20' as const,
      }
      const amount = 1000
      const marketId = mockMarketId
      const mockTransaction = {
        amount: 1000000000n,
        asset: mockAsset.address[130],
        marketId: marketId.address,
        apy: 0.05,
        transactionData: {
          position: {
            to: marketId.address,
            value: 0n,
            data: '0x' as const,
          },
        },
      }

      vi.mocked(mockProvider.openPosition).mockResolvedValue(mockTransaction)

      const result = await namespace.openPosition({
        amount,
        asset: mockAsset,
        marketId,
      })

      expect(result).toEqual({
        receipt: { success: true },
        userOpHash: '0xmockhash',
      })

      expect(mockProvider.openPosition).toHaveBeenCalledWith({
        amount,
        asset: mockAsset,
        marketId,
        walletAddress: mockWalletAddress,
        options: undefined,
      })
    })
  })

  describe('closePosition', () => {
    it('should call provider closePosition and execute transaction for SmartWallet', async () => {
      const namespace = new WalletLendNamespace(
        { morpho: mockProvider },
        mockWallet,
      )
      const closeParams = {
        amount: 100,
        marketId: mockMarketId,
      }

      const mockTransaction = {
        amount: 100n,
        asset: getRandomAddress(),
        marketId: closeParams.marketId.address,
        apy: 0.05,
        transactionData: {
          position: {
            to: closeParams.marketId.address,
            value: 0n,
            data: '0x' as const,
          },
        },
      }

      vi.mocked(mockProvider.closePosition).mockResolvedValue(mockTransaction)

      const result = await namespace.closePosition(closeParams)

      expect(mockProvider.closePosition).toHaveBeenCalledWith({
        ...closeParams,
        walletAddress: mockWallet.address,
        options: undefined,
      })
      expect(mockWallet.send).toHaveBeenCalledWith(
        mockTransaction.transactionData.position,
        130,
      )
      expect(result).toEqual({
        receipt: { success: true },
        userOpHash: '0xmockhash',
      })
    })
  })

  it('should store the wallet reference', () => {
    const namespace = new WalletLendNamespace(
      { morpho: mockProvider },
      mockWallet,
    )

    expect(namespace['wallet']).toBe(mockWallet)
    expect(namespace['wallet'].address).toBe(mockWalletAddress)
  })

  it('should execute transaction with approval when present', async () => {
    const namespace = new WalletLendNamespace(
      { morpho: mockProvider },
      mockWallet,
    )
    const mockAsset = {
      address: { 130: getRandomAddress() },
      metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      type: 'erc20' as const,
    }
    const marketId = mockMarketId
    const approval: TransactionData = {
      to: mockAsset.address[130],
      value: 0n,
      data: '0xapproval' as const,
    }
    const position: TransactionData = {
      to: marketId.address,
      value: 0n,
      data: '0xdeposit' as const,
    }
    const mockTransaction = {
      amount: 1000000000n,
      asset: mockAsset.address[130],
      marketId: marketId.address,
      apy: 0.05,
      timestamp: Date.now(),
      transactionData: { approval, position },
    }

    vi.mocked(mockProvider.openPosition).mockResolvedValue(mockTransaction)

    const result = await namespace.openPosition({
      amount: 1000,
      asset: mockAsset,
      marketId,
    })

    expect(mockWallet.sendBatch).toHaveBeenCalledWith([approval, position], 130)
    expect(result).toEqual({
      receipt: { success: true },
      userOpHash: '0xmockbatchhash',
    })
  })
})
