import type { WaitForUserOperationReceiptReturnType } from 'viem/account-abstraction'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { getRandomAddress } from '@/test/utils.js'
import type { LendProvider, TransactionData } from '@/types/lend.js'
import { createMock as createSmartWalletMock } from '@/wallet/core/wallets/smart/abstract/__mocks__/SmartWallet.js'
import type { SmartWallet } from '@/wallet/core/wallets/smart/abstract/SmartWallet.js'

import { WalletLendNamespace } from './WalletLendNamespace.js'

describe('WalletLendNamespace', () => {
  const mockWalletAddress = getRandomAddress()
  let mockProvider: LendProvider
  let mockWallet: SmartWallet
  let mockRegularWallet: any

  beforeEach(() => {
    mockProvider = createMockLendProvider()
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

    // Create a mock regular wallet without SmartWallet methods
    mockRegularWallet = {
      address: mockWalletAddress,
      send: undefined,
      sendBatch: undefined,
    }
  })

  it('should create an instance with a lend provider and wallet', () => {
    const namespace = new WalletLendNamespace(mockProvider, mockWallet)

    expect(namespace).toBeInstanceOf(WalletLendNamespace)
  })

  it('should inherit read operations from VerbsLendNamespace', async () => {
    const namespace = new WalletLendNamespace(mockProvider, mockWallet)
    const mockMarkets = [
      {
        chainId: 130,
        address: getRandomAddress(),
        name: 'Test Vault',
        asset: getRandomAddress(),
        totalAssets: BigInt('1000000'),
        totalShares: BigInt('1000000'),
        apy: 0.05,
        apyBreakdown: {
          nativeApy: 0.04,
          totalRewardsApr: 0.01,
          performanceFee: 0.0,
          netApy: 0.05,
        },
        owner: getRandomAddress(),
        curator: getRandomAddress(),
        fee: 0.1,
        lastUpdate: Date.now(),
      },
    ]

    vi.mocked(mockProvider.getMarkets).mockResolvedValue(mockMarkets)

    const result = await namespace.getMarkets()

    expect(mockProvider.getMarkets).toHaveBeenCalled()
    expect(result).toBe(mockMarkets)
  })

  describe('openPosition', () => {
    it('should call provider openPosition with wallet address as receiver', async () => {
      const namespace = new WalletLendNamespace(mockProvider, mockWallet)
      const mockAsset = {
        address: { 130: getRandomAddress() },
        metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        type: 'erc20' as const,
      }
      const amount = 1000
      const marketId = { address: getRandomAddress(), chainId: 130 as const }
      const mockTransaction = {
        amount: 1000000000n,
        asset: mockAsset.address[130],
        marketId: marketId.address,
        apy: 0.05,
        timestamp: Date.now(),
        transactionData: {
          openPosition: {
            to: marketId.address,
            value: 0n,
            data: '0x' as const,
          },
        },
        slippage: 50,
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
      const namespace = new WalletLendNamespace(mockProvider, mockWallet)
      const closeParams = {
        amount: 100,
        marketId: { address: getRandomAddress(), chainId: 130 as const },
      }

      const mockTransaction = {
        amount: 100n,
        asset: getRandomAddress(),
        marketId: closeParams.marketId.address,
        apy: 0.05,
        timestamp: Date.now(),
        transactionData: {
          closePosition: {
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
        mockTransaction.transactionData.closePosition,
        130,
      )
      expect(result).toEqual({
        receipt: { success: true },
        userOpHash: '0xmockhash',
      })
    })

    it('should throw error for non-SmartWallet', async () => {
      const namespace = new WalletLendNamespace(mockProvider, mockRegularWallet)
      const closeParams = {
        amount: 100,
        marketId: { address: getRandomAddress(), chainId: 130 as const },
      }

      const mockTransaction = {
        amount: 100n,
        asset: getRandomAddress(),
        marketId: closeParams.marketId.address,
        apy: 0.05,
        timestamp: Date.now(),
        transactionData: {
          closePosition: {
            to: closeParams.marketId.address,
            value: 0n,
            data: '0x' as const,
          },
        },
      }

      vi.mocked(mockProvider.closePosition).mockResolvedValue(mockTransaction)

      await expect(namespace.closePosition(closeParams)).rejects.toThrow(
        'Transaction execution is only supported for SmartWallet instances',
      )
    })
  })

  it('should store the wallet reference', () => {
    const namespace = new WalletLendNamespace(mockProvider, mockWallet)

    expect(namespace['wallet']).toBe(mockWallet)
    expect(namespace['wallet'].address).toBe(mockWalletAddress)
  })

  it('should execute transaction with approval when present', async () => {
    const namespace = new WalletLendNamespace(mockProvider, mockWallet)
    const mockAsset = {
      address: { 130: getRandomAddress() },
      metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      type: 'erc20' as const,
    }
    const marketId = { address: getRandomAddress(), chainId: 130 as const }
    const approval: TransactionData = {
      to: mockAsset.address[130],
      value: 0n,
      data: '0xapproval' as const,
    }
    const openPosition: TransactionData = {
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
      transactionData: { approval, openPosition },
      slippage: 50,
    }

    vi.mocked(mockProvider.openPosition).mockResolvedValue(mockTransaction)

    const result = await namespace.openPosition({
      amount: 1000,
      asset: mockAsset,
      marketId,
    })

    expect(mockWallet.sendBatch).toHaveBeenCalledWith(
      [approval, openPosition],
      130,
    )
    expect(result).toEqual({
      receipt: { success: true },
      userOpHash: '0xmockbatchhash',
    })
  })
})
