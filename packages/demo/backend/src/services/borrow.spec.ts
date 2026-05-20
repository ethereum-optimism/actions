import type { BorrowReceipt } from '@eth-optimism/actions-sdk'
import { ProviderNotConfiguredError } from '@eth-optimism/actions-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WalletNotFoundError } from '@/helpers/errors.js'

import * as borrowService from './borrow.js'

vi.mock('../config/actions.js', () => ({
  getActions: vi.fn(),
}))

vi.mock('./wallet.js', () => ({
  getWallet: vi.fn(),
}))

vi.mock('../utils/explorers.js', () => ({
  getBlockExplorerUrls: vi.fn(() => []),
}))

vi.mock('../config/markets.js', async () => {
  const baseMarketId = {
    kind: 'morpho-blue' as const,
    marketId: ('0x' + 'a'.repeat(64)) as `0x${string}`,
    chainId: 84532 as never,
  }
  return {
    ALL_BORROW_MARKETS: [
      {
        ...baseMarketId,
        name: 'Demo dUSDC / OP',
        collateralAsset: { metadata: { symbol: 'USDC_DEMO' } },
        borrowAsset: { metadata: { symbol: 'OP_DEMO' } },
        borrowProvider: 'morpho',
        lendProvider: 'morpho',
        marketParams: {
          loanToken: '0x0',
          collateralToken: '0x0',
          oracle: '0x0',
          irm: '0x0',
          lltv: 0n,
        },
      },
    ],
  }
})

const mockBorrowProvider = {
  getMarket: vi.fn(),
  getMarkets: vi.fn(),
  getPosition: vi.fn(),
  getPrice: vi.fn(),
  getQuote: vi.fn(),
}

const mockWalletBorrow = {
  openPosition: vi.fn(),
  closePosition: vi.fn(),
  depositCollateral: vi.fn(),
  withdrawCollateral: vi.fn(),
  repay: vi.fn(),
}

const mockActions = {
  borrow: mockBorrowProvider,
}

const mockWalletAddress = '0xabcdef0123456789abcdef0123456789abcdef01'

const mockWallet = {
  address: mockWalletAddress,
  borrow: mockWalletBorrow,
}

const baseMarketId = {
  kind: 'morpho-blue' as const,
  marketId: ('0x' + 'a'.repeat(64)) as `0x${string}`,
  chainId: 84532 as never,
}

describe('Borrow Service', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { getActions } = await import('../config/actions.js')
    vi.mocked(getActions).mockReturnValue(mockActions as never)
    const { getBlockExplorerUrls } = await import('../utils/explorers.js')
    vi.mocked(getBlockExplorerUrls).mockReturnValue([])
  })

  describe('getMarkets', () => {
    it('calls actions.borrow.getMarkets with empty params by default', async () => {
      mockBorrowProvider.getMarkets.mockResolvedValue([])
      const result = await borrowService.getMarkets()
      expect(mockBorrowProvider.getMarkets).toHaveBeenCalledWith({})
      expect(result).toEqual([])
    })

    it('passes through chainId filter', async () => {
      mockBorrowProvider.getMarkets.mockResolvedValue([])
      await borrowService.getMarkets({ chainId: 84532 as never })
      expect(mockBorrowProvider.getMarkets).toHaveBeenCalledWith({
        chainId: 84532,
      })
    })

    it('propagates errors from the SDK', async () => {
      mockBorrowProvider.getMarkets.mockRejectedValue(new Error('rpc down'))
      await expect(borrowService.getMarkets()).rejects.toThrow('rpc down')
    })
  })

  describe('getPrice', () => {
    it('resolves marketId to a config and forwards to actions.borrow.getPrice', async () => {
      const price = { positionAfter: {}, safeCeilingLtv: 0n } as never
      mockBorrowProvider.getPrice.mockResolvedValue(price)
      const result = await borrowService.getPrice({
        action: 'open',
        marketId: baseMarketId,
        borrowAmount: { amount: 5 },
      })
      expect(mockBorrowProvider.getPrice).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'open',
          market: expect.objectContaining({ kind: 'morpho-blue' }),
          borrowAmount: { amount: 5 },
        }),
      )
      expect(result).toBe(price)
    })

    it('throws MarketNotAllowedError when marketId is not in the allowlist', async () => {
      await expect(
        borrowService.getPrice({
          action: 'open',
          marketId: {
            ...baseMarketId,
            marketId: ('0x' + 'b'.repeat(64)) as `0x${string}`,
          },
          borrowAmount: { amount: 5 },
        }),
      ).rejects.toThrow(/Market.*not in/i)
      expect(mockBorrowProvider.getPrice).not.toHaveBeenCalled()
    })
  })

  describe('getQuote', () => {
    it('resolves marketId to a config and forwards to actions.borrow.getQuote', async () => {
      const quote = { execution: { transactions: [] } } as never
      mockBorrowProvider.getQuote.mockResolvedValue(quote)
      const result = await borrowService.getQuote({
        action: 'open',
        marketId: baseMarketId,
        borrowAmount: { amount: 5 },
        walletAddress: '0xaabbccddeeff00112233445566778899aabbccdd' as never,
      })
      expect(mockBorrowProvider.getQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'open',
          market: expect.objectContaining({ kind: 'morpho-blue' }),
          walletAddress: '0xaabbccddeeff00112233445566778899aabbccdd',
        }),
      )
      expect(result).toBe(quote)
    })

    it('throws MarketNotAllowedError when marketId is not in the allowlist', async () => {
      await expect(
        borrowService.getQuote({
          action: 'open',
          marketId: {
            ...baseMarketId,
            marketId: ('0x' + 'c'.repeat(64)) as `0x${string}`,
          },
          borrowAmount: { amount: 5 },
        }),
      ).rejects.toThrow(/Market.*not in/i)
      expect(mockBorrowProvider.getQuote).not.toHaveBeenCalled()
    })
  })

  describe('resolveMarketConfig', () => {
    it('returns the matching config from the allowlist (case-insensitive)', () => {
      const result = borrowService.resolveMarketConfig({
        ...baseMarketId,
        marketId: ('0x' + 'A'.repeat(64)) as `0x${string}`,
      })
      expect(result.marketId.toLowerCase()).toBe(baseMarketId.marketId)
    })

    it('throws MarketNotAllowedError for unknown marketId', () => {
      expect(() =>
        borrowService.resolveMarketConfig({
          ...baseMarketId,
          marketId: ('0x' + 'b'.repeat(64)) as `0x${string}`,
        }),
      ).toThrow()
    })
  })

  describe('openPosition', () => {
    const fullParams = {
      idToken: 'idtok',
      marketId: baseMarketId,
      borrowAmount: { amount: 5 },
      collateralAmount: { amount: 100 },
    }

    beforeEach(async () => {
      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue(mockWallet as never)
    })

    it('resolves the market config and calls wallet.borrow.openPosition', async () => {
      const receipt = { tag: 'open-receipt' } as unknown as BorrowReceipt
      mockWalletBorrow.openPosition.mockResolvedValue(receipt)

      const result = await borrowService.openPosition(fullParams)

      expect(mockWalletBorrow.openPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          market: expect.objectContaining({ kind: 'morpho-blue' }),
          borrowAmount: { amount: 5 },
          collateralAmount: { amount: 100 },
        }),
      )
      expect(result).toEqual({ ...receipt, blockExplorerUrls: [] })
    })

    it('forwards a pre-built quote unchanged to the SDK', async () => {
      const quote = {
        action: 'open',
        marketId: baseMarketId,
        tag: 'q',
      } as never
      const receipt = { tag: 'q-receipt' } as unknown as BorrowReceipt
      mockWalletBorrow.openPosition.mockResolvedValue(receipt)

      const result = await borrowService.openPosition({
        idToken: 'idtok',
        quote,
      })

      expect(mockWalletBorrow.openPosition).toHaveBeenCalledWith(quote)
      expect(result).toEqual({ ...receipt, blockExplorerUrls: [] })
    })

    it('throws WalletNotFoundError when the wallet cannot be resolved', async () => {
      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue(null)
      await expect(
        borrowService.openPosition(fullParams),
      ).rejects.toBeInstanceOf(WalletNotFoundError)
      expect(mockWalletBorrow.openPosition).not.toHaveBeenCalled()
    })

    it('throws ProviderNotConfiguredError when wallet.borrow is undefined', async () => {
      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue({
        ...mockWallet,
        borrow: undefined,
      } as never)
      await expect(
        borrowService.openPosition(fullParams),
      ).rejects.toBeInstanceOf(ProviderNotConfiguredError)
    })

    it('propagates SDK errors', async () => {
      mockWalletBorrow.openPosition.mockRejectedValue(
        new Error('insufficient liquidity'),
      )
      await expect(borrowService.openPosition(fullParams)).rejects.toThrow(
        'insufficient liquidity',
      )
    })

    it('decorates the receipt with block-explorer URLs from the chain', async () => {
      const { getBlockExplorerUrls } = await import('../utils/explorers.js')
      vi.mocked(getBlockExplorerUrls).mockReturnValue([
        'https://sepolia.basescan.org/tx/0xabc',
      ])
      const receipt = {
        userOpHash: '0xuserop',
        transactionHash: '0xtx',
      } as unknown as BorrowReceipt
      mockWalletBorrow.openPosition.mockResolvedValue(receipt)

      const result = await borrowService.openPosition(fullParams)

      expect(getBlockExplorerUrls).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: 84532,
          userOpHash: '0xuserop',
          transactionHash: '0xtx',
        }),
      )
      expect(result.blockExplorerUrls).toEqual([
        'https://sepolia.basescan.org/tx/0xabc',
      ])
    })

    it('reads chainId from quote.marketId on the quote branch', async () => {
      const { getBlockExplorerUrls } = await import('../utils/explorers.js')
      vi.mocked(getBlockExplorerUrls).mockReturnValue([])
      const quote = {
        action: 'open',
        marketId: { ...baseMarketId, chainId: 11155420 as never },
      } as never
      mockWalletBorrow.openPosition.mockResolvedValue({
        userOpHash: '0xq',
      } as unknown as BorrowReceipt)

      await borrowService.openPosition({ idToken: 'idtok', quote })

      expect(getBlockExplorerUrls).toHaveBeenCalledWith(
        expect.objectContaining({ chainId: 11155420 }),
      )
    })
  })

  describe('closePosition', () => {
    beforeEach(async () => {
      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue(mockWallet as never)
    })

    it('calls wallet.borrow.closePosition with resolved market', async () => {
      const receipt = { tag: 'close' } as unknown as BorrowReceipt
      mockWalletBorrow.closePosition.mockResolvedValue(receipt)
      const result = await borrowService.closePosition({
        idToken: 'idtok',
        marketId: baseMarketId,
        borrowAmount: { max: true },
        collateralAmount: { max: true },
      })
      expect(mockWalletBorrow.closePosition).toHaveBeenCalledWith(
        expect.objectContaining({
          market: expect.objectContaining({ kind: 'morpho-blue' }),
          borrowAmount: { max: true },
          collateralAmount: { max: true },
        }),
      )
      expect(result).toEqual({ ...receipt, blockExplorerUrls: [] })
    })

    it('forwards a pre-built quote unchanged', async () => {
      const quote = {
        action: 'close',
        marketId: baseMarketId,
        tag: 'q',
      } as never
      const receipt = { tag: 'r' } as unknown as BorrowReceipt
      mockWalletBorrow.closePosition.mockResolvedValue(receipt)
      const result = await borrowService.closePosition({
        idToken: 'idtok',
        quote,
      })
      expect(mockWalletBorrow.closePosition).toHaveBeenCalledWith(quote)
      expect(result).toEqual({ ...receipt, blockExplorerUrls: [] })
    })
  })

  describe('depositCollateral', () => {
    beforeEach(async () => {
      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue(mockWallet as never)
    })

    it('calls wallet.borrow.depositCollateral with resolved market', async () => {
      const receipt = { tag: 'dep' } as unknown as BorrowReceipt
      mockWalletBorrow.depositCollateral.mockResolvedValue(receipt)
      const result = await borrowService.depositCollateral({
        idToken: 'idtok',
        marketId: baseMarketId,
        amount: { amount: 50 },
      })
      expect(mockWalletBorrow.depositCollateral).toHaveBeenCalledWith(
        expect.objectContaining({
          market: expect.objectContaining({ kind: 'morpho-blue' }),
          amount: { amount: 50 },
        }),
      )
      expect(result).toEqual({ ...receipt, blockExplorerUrls: [] })
    })

    it('forwards a pre-built quote unchanged', async () => {
      const quote = {
        action: 'depositCollateral',
        marketId: baseMarketId,
      } as never
      const receipt = { tag: 'r' } as unknown as BorrowReceipt
      mockWalletBorrow.depositCollateral.mockResolvedValue(receipt)
      await borrowService.depositCollateral({ idToken: 'idtok', quote })
      expect(mockWalletBorrow.depositCollateral).toHaveBeenCalledWith(quote)
    })
  })

  describe('withdrawCollateral', () => {
    beforeEach(async () => {
      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue(mockWallet as never)
    })

    it('calls wallet.borrow.withdrawCollateral with resolved market', async () => {
      const receipt = { tag: 'w' } as unknown as BorrowReceipt
      mockWalletBorrow.withdrawCollateral.mockResolvedValue(receipt)
      await borrowService.withdrawCollateral({
        idToken: 'idtok',
        marketId: baseMarketId,
        amount: { max: true },
      })
      expect(mockWalletBorrow.withdrawCollateral).toHaveBeenCalledWith(
        expect.objectContaining({
          market: expect.objectContaining({ kind: 'morpho-blue' }),
          amount: { max: true },
        }),
      )
    })

    it('forwards a pre-built quote unchanged', async () => {
      const quote = {
        action: 'withdrawCollateral',
        marketId: baseMarketId,
      } as never
      mockWalletBorrow.withdrawCollateral.mockResolvedValue({} as never)
      await borrowService.withdrawCollateral({ idToken: 'idtok', quote })
      expect(mockWalletBorrow.withdrawCollateral).toHaveBeenCalledWith(quote)
    })
  })

  describe('repay', () => {
    beforeEach(async () => {
      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue(mockWallet as never)
    })

    it('calls wallet.borrow.repay with resolved market', async () => {
      const receipt = { tag: 'rep' } as unknown as BorrowReceipt
      mockWalletBorrow.repay.mockResolvedValue(receipt)
      await borrowService.repay({
        idToken: 'idtok',
        marketId: baseMarketId,
        amount: { amount: 1 },
      })
      expect(mockWalletBorrow.repay).toHaveBeenCalledWith(
        expect.objectContaining({
          market: expect.objectContaining({ kind: 'morpho-blue' }),
          amount: { amount: 1 },
        }),
      )
    })

    it('forwards a pre-built quote unchanged', async () => {
      const quote = { action: 'repay', marketId: baseMarketId } as never
      mockWalletBorrow.repay.mockResolvedValue({} as never)
      await borrowService.repay({ idToken: 'idtok', quote })
      expect(mockWalletBorrow.repay).toHaveBeenCalledWith(quote)
    })
  })
})
