import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { getRandomAddress } from '@/test/utils.js'
import type { LendProvider } from '@/types/lend.js'

import { WalletLendNamespace } from './WalletLendNamespace.js'

describe('WalletLendNamespace', () => {
  const mockWalletAddress = getRandomAddress()
  let mockProvider: LendProvider

  beforeEach(() => {
    mockProvider = createMockLendProvider()
  })

  it('should create an instance with a lend provider and wallet address', () => {
    const namespace = new WalletLendNamespace(mockProvider, mockWalletAddress)

    expect(namespace).toBeInstanceOf(WalletLendNamespace)
  })

  it('should inherit read operations from VerbsLendNamespace', async () => {
    const namespace = new WalletLendNamespace(mockProvider, mockWalletAddress)
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

  describe('lendExecute', () => {
    it('should call provider lend with wallet address as receiver', async () => {
      const namespace = new WalletLendNamespace(mockProvider, mockWalletAddress)
      const asset = getRandomAddress()
      const amount = BigInt('1000000')
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

      vi.mocked(mockProvider.lend).mockResolvedValue(mockTransaction)

      const result = await namespace.lendExecute(asset, amount, marketId)

      expect(mockProvider.lend).toHaveBeenCalledWith(asset, amount, marketId, {
        receiver: mockWalletAddress,
      })
      expect(result).toBe(mockTransaction)
    })

    it('should preserve custom receiver in options', async () => {
      const namespace = new WalletLendNamespace(mockProvider, mockWalletAddress)
      const asset = getRandomAddress()
      const amount = BigInt('1000000')
      const customReceiver = getRandomAddress()
      const options = { receiver: customReceiver, slippage: 100 }

      await namespace.lendExecute(asset, amount, undefined, options)

      expect(mockProvider.lend).toHaveBeenCalledWith(
        asset,
        amount,
        undefined,
        options,
      )
    })
  })

  describe('deposit', () => {
    it('should delegate to lendExecute', async () => {
      const namespace = new WalletLendNamespace(mockProvider, mockWalletAddress)
      const asset = getRandomAddress()
      const amount = BigInt('1000000')
      const marketId = 'test-market'
      const options = { slippage: 75 }

      const lendExecuteSpy = vi.spyOn(namespace, 'lendExecute')
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
        slippage: 75,
      }
      lendExecuteSpy.mockResolvedValue(mockTransaction)

      const result = await namespace.deposit(asset, amount, marketId, options)

      expect(lendExecuteSpy).toHaveBeenCalledWith(
        asset,
        amount,
        marketId,
        options,
      )
      expect(result).toBe(mockTransaction)
    })
  })

  describe('withdraw', () => {
    it('should call provider withdraw with wallet address as receiver', async () => {
      const namespace = new WalletLendNamespace(mockProvider, mockWalletAddress)
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

      const result = await namespace.withdraw(asset, amount, marketId)

      expect(mockProvider.withdraw).toHaveBeenCalledWith(
        asset,
        amount,
        marketId,
        {
          receiver: mockWalletAddress,
        },
      )
      expect(result).toBe(mockTransaction)
    })

    it('should preserve custom receiver in options', async () => {
      const namespace = new WalletLendNamespace(mockProvider, mockWalletAddress)
      const asset = getRandomAddress()
      const amount = BigInt('500000')
      const customReceiver = getRandomAddress()
      const options = { receiver: customReceiver, slippage: 200 }

      await namespace.withdraw(asset, amount, undefined, options)

      expect(mockProvider.withdraw).toHaveBeenCalledWith(
        asset,
        amount,
        undefined,
        options,
      )
    })
  })

  it('should store the wallet address', () => {
    const namespace = new WalletLendNamespace(mockProvider, mockWalletAddress)

    expect(namespace['address']).toBe(mockWalletAddress)
  })
})
