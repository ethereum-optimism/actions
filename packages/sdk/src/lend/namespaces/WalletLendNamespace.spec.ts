import type { Hash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { getRandomAddress } from '@/test/utils.js'
import type { LendProvider, TransactionData } from '@/types/lend.js'
import type { SmartWallet } from '@/wallet/base/SmartWallet.js'

import { WalletLendNamespace } from './WalletLendNamespace.js'

describe('WalletLendNamespace', () => {
  const mockWalletAddress = getRandomAddress()
  let mockProvider: LendProvider
  let mockWallet: SmartWallet

  beforeEach(() => {
    mockProvider = createMockLendProvider()
    // Create a mock wallet with send and sendBatch methods
    mockWallet = {
      address: mockWalletAddress,
      send: vi.fn().mockResolvedValue('0xmockhash' as Hash),
      sendBatch: vi.fn().mockResolvedValue('0xmockbatchhash' as Hash),
    } as unknown as SmartWallet
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
          deposit: {
            to: marketId.address,
            value: 0n,
            data: '0x' as const,
          },
        },
        slippage: 50,
      }

      vi.mocked(mockProvider.openPosition).mockResolvedValue(mockTransaction)

      // Should now execute the transaction
      const result = await namespace.openPosition({
        amount,
        asset: mockAsset,
        marketId,
      })

      expect(result).toBe('0xmockhash')

      expect(mockProvider.openPosition).toHaveBeenCalledWith({
        amount,
        asset: mockAsset,
        marketId,
        options: {
          receiver: mockWalletAddress,
        },
      })
    })
  })

  describe('withdraw', () => {
    it('should call provider withdraw with wallet address as receiver', async () => {
      const namespace = new WalletLendNamespace(mockProvider, mockWallet)
      const asset = getRandomAddress()
      const amount = BigInt('500000')
      const marketId = 'test-market'
      const mockTransaction = {
        amount,
        asset,
        marketId,
        apy: 0.05,
        timestamp: Date.now(),
        transactionData: {
          deposit: {
            to: asset,
            value: 0n,
            data: '0x' as const,
          },
        },
        slippage: 50,
      }

      vi.mocked(mockProvider.withdraw).mockResolvedValue(mockTransaction)

      const result = await namespace.withdraw(asset, amount, 130, marketId)

      expect(mockProvider.withdraw).toHaveBeenCalledWith(
        asset,
        amount,
        130,
        marketId,
        {
          receiver: mockWalletAddress,
        },
      )
      expect(result).toBe(mockTransaction)
    })

    it('should always use wallet address as receiver, ignoring custom receiver', async () => {
      const namespace = new WalletLendNamespace(mockProvider, mockWallet)
      const asset = getRandomAddress()
      const amount = BigInt('500000')
      const customReceiver = getRandomAddress()
      const options = { receiver: customReceiver, slippage: 200 }

      await namespace.withdraw(asset, amount, 130, undefined, options)

      expect(mockProvider.withdraw).toHaveBeenCalledWith(
        asset,
        amount,
        130,
        undefined,
        {
          receiver: mockWalletAddress, // Should always be wallet address
          slippage: 200,
        },
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
    const deposit: TransactionData = {
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
      transactionData: { approval, deposit },
      slippage: 50,
    }

    vi.mocked(mockProvider.openPosition).mockResolvedValue(mockTransaction)

    const result = await namespace.openPosition({
      amount: 1000,
      asset: mockAsset,
      marketId,
    })

    expect(mockWallet.sendBatch).toHaveBeenCalledWith([approval, deposit], 130)
    expect(result).toBe('0xmockbatchhash')
  })
})
