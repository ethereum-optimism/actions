import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as borrowService from './borrow.js'

vi.mock('../config/actions.js', () => ({
  getActions: vi.fn(),
}))

vi.mock('./wallet.js', () => ({
  getWallet: vi.fn(),
}))

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

    it('returns the markets array from the SDK verbatim', async () => {
      const market = {
        marketId: {
          kind: 'morpho-blue' as const,
          marketId: ('0x' + 'a'.repeat(64)) as `0x${string}`,
          chainId: 84532 as never,
        },
        // Other fields omitted; service is a pure passthrough.
      }
      mockBorrowProvider.getMarkets.mockResolvedValue([market] as never)
      const result = await borrowService.getMarkets()
      expect(result).toEqual([market])
    })

    it('propagates errors from the SDK', async () => {
      mockBorrowProvider.getMarkets.mockRejectedValue(new Error('rpc down'))
      await expect(borrowService.getMarkets()).rejects.toThrow('rpc down')
    })
  })

  describe('getPrice', () => {
    const baseParams = {
      action: 'open' as const,
      marketId: {
        kind: 'morpho-blue' as const,
        marketId: ('0x' + 'a'.repeat(64)) as `0x${string}`,
        chainId: 84532 as never,
      },
      borrowAmount: { amount: 5 },
    }

    afterEach(() => {
      borrowService._clearPriceCache()
      vi.useRealTimers()
    })

    it('calls the SDK and returns the price', async () => {
      const price = { safeCeilingLtv: 0.8 } as never
      mockBorrowProvider.getPrice.mockResolvedValue(price)
      const result = await borrowService.getPrice(baseParams)
      expect(mockBorrowProvider.getPrice).toHaveBeenCalledWith(baseParams)
      expect(result).toBe(price)
    })

    it('returns cached value on second call within TTL', async () => {
      const price1 = { tag: 'first' } as never
      const price2 = { tag: 'second' } as never
      mockBorrowProvider.getPrice
        .mockResolvedValueOnce(price1)
        .mockResolvedValueOnce(price2)

      const r1 = await borrowService.getPrice(baseParams)
      const r2 = await borrowService.getPrice(baseParams)

      expect(r1).toBe(price1)
      expect(r2).toBe(price1) // cached; SDK not called again
      expect(mockBorrowProvider.getPrice).toHaveBeenCalledTimes(1)
    })

    it('refreshes after TTL expiry', async () => {
      vi.useFakeTimers()
      const price1 = { tag: 'first' } as never
      const price2 = { tag: 'second' } as never
      mockBorrowProvider.getPrice
        .mockResolvedValueOnce(price1)
        .mockResolvedValueOnce(price2)

      const r1 = await borrowService.getPrice(baseParams)
      vi.advanceTimersByTime(11_000) // > 10s TTL
      const r2 = await borrowService.getPrice(baseParams)

      expect(r1).toBe(price1)
      expect(r2).toBe(price2)
      expect(mockBorrowProvider.getPrice).toHaveBeenCalledTimes(2)
    })

    it('uses distinct cache keys for distinct params', async () => {
      mockBorrowProvider.getPrice.mockResolvedValue({ tag: 'x' } as never)

      await borrowService.getPrice(baseParams)
      await borrowService.getPrice({
        ...baseParams,
        borrowAmount: { amount: 10 }, // different amount → distinct key
      })

      expect(mockBorrowProvider.getPrice).toHaveBeenCalledTimes(2)
    })

    it('serializes bigint amountRaw in cache keys without throwing', async () => {
      mockBorrowProvider.getPrice.mockResolvedValue({ tag: 'x' } as never)
      await borrowService.getPrice({
        ...baseParams,
        borrowAmount: { amountRaw: 1500000n },
      })
      expect(mockBorrowProvider.getPrice).toHaveBeenCalledTimes(1)
    })
  })

  describe('getQuote', () => {
    const baseParams = {
      idToken: 'idtok',
      action: 'open' as const,
      marketId: {
        kind: 'morpho-blue' as const,
        marketId: ('0x' + 'a'.repeat(64)) as `0x${string}`,
        chainId: 84532 as never,
      },
      borrowAmount: { amount: 5 },
    }

    it('looks up the wallet from the idToken and passes its address as recipient', async () => {
      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue({
        address: mockWalletAddress,
      } as never)
      const quote = { tag: 'q' } as never
      mockBorrowProvider.getQuote.mockResolvedValue(quote)

      const result = await borrowService.getQuote(baseParams)

      expect(getWallet).toHaveBeenCalledWith('idtok')
      expect(mockBorrowProvider.getQuote).toHaveBeenCalledWith({
        action: 'open',
        marketId: baseParams.marketId,
        borrowAmount: { amount: 5 },
        collateralAmount: undefined,
        recipient: mockWalletAddress,
      })
      expect(result).toBe(quote)
    })

    it('throws when the wallet cannot be resolved', async () => {
      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue(null)
      await expect(borrowService.getQuote(baseParams)).rejects.toThrow(
        'Wallet not found',
      )
      expect(mockBorrowProvider.getQuote).not.toHaveBeenCalled()
    })

    it('propagates errors from the SDK', async () => {
      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue({
        address: mockWalletAddress,
      } as never)
      mockBorrowProvider.getQuote.mockRejectedValue(new Error('quote-failed'))
      await expect(borrowService.getQuote(baseParams)).rejects.toThrow(
        'quote-failed',
      )
    })
  })

  describe('openPosition', () => {
    const fullParams = {
      idToken: 'idtok',
      marketId: baseMarketId,
      borrowAmount: { amount: 5 },
      collateralAmount: { amount: 100 },
      collateralAsset: mockWalletAddress as never,
    }

    beforeEach(async () => {
      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue(mockWallet as never)
    })

    it('calls wallet.borrow.openPosition with fresh params', async () => {
      const receipt = { tag: 'open-receipt' } as never
      mockWalletBorrow.openPosition.mockResolvedValue(receipt)

      const result = await borrowService.openPosition(fullParams)

      expect(mockWalletBorrow.openPosition).toHaveBeenCalledWith({
        marketId: baseMarketId,
        borrowAmount: { amount: 5 },
        collateralAmount: { amount: 100 },
        collateralAsset: mockWalletAddress,
      })
      expect(result).toBe(receipt)
    })

    it('forwards a pre-built quote unchanged to the SDK', async () => {
      const quote = { action: 'open', tag: 'q' } as never
      const receipt = { tag: 'q-receipt' } as never
      mockWalletBorrow.openPosition.mockResolvedValue(receipt)

      const result = await borrowService.openPosition({
        idToken: 'idtok',
        quote,
      })

      expect(mockWalletBorrow.openPosition).toHaveBeenCalledWith(quote)
      expect(result).toBe(receipt)
    })

    it('throws when the wallet cannot be resolved', async () => {
      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue(null)
      await expect(borrowService.openPosition(fullParams)).rejects.toThrow(
        'Wallet not found',
      )
      expect(mockWalletBorrow.openPosition).not.toHaveBeenCalled()
    })

    it('propagates SDK errors', async () => {
      mockWalletBorrow.openPosition.mockRejectedValue(
        new Error('insufficient liquidity'),
      )
      await expect(borrowService.openPosition(fullParams)).rejects.toThrow(
        'insufficient liquidity',
      )
    })
  })

  describe('closePosition', () => {
    beforeEach(async () => {
      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue(mockWallet as never)
    })

    it('calls wallet.borrow.closePosition with fresh params', async () => {
      const receipt = { tag: 'close' } as never
      mockWalletBorrow.closePosition.mockResolvedValue(receipt)
      const result = await borrowService.closePosition({
        idToken: 'idtok',
        marketId: baseMarketId,
        borrowAmount: { max: true },
        collateralAmount: { max: true },
      })
      expect(mockWalletBorrow.closePosition).toHaveBeenCalledWith({
        marketId: baseMarketId,
        borrowAmount: { max: true },
        collateralAmount: { max: true },
      })
      expect(result).toBe(receipt)
    })

    it('forwards a pre-built quote unchanged', async () => {
      const quote = { action: 'close', tag: 'q' } as never
      const receipt = { tag: 'r' } as never
      mockWalletBorrow.closePosition.mockResolvedValue(receipt)
      const result = await borrowService.closePosition({
        idToken: 'idtok',
        quote,
      })
      expect(mockWalletBorrow.closePosition).toHaveBeenCalledWith(quote)
      expect(result).toBe(receipt)
    })
  })

  describe('depositCollateral', () => {
    beforeEach(async () => {
      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue(mockWallet as never)
    })

    it('calls wallet.borrow.depositCollateral with fresh params', async () => {
      const receipt = { tag: 'dep' } as never
      mockWalletBorrow.depositCollateral.mockResolvedValue(receipt)
      const result = await borrowService.depositCollateral({
        idToken: 'idtok',
        marketId: baseMarketId,
        amount: { amount: 50 },
      })
      expect(mockWalletBorrow.depositCollateral).toHaveBeenCalledWith({
        marketId: baseMarketId,
        amount: { amount: 50 },
      })
      expect(result).toBe(receipt)
    })

    it('forwards a pre-built quote unchanged', async () => {
      const quote = { action: 'depositCollateral' } as never
      const receipt = { tag: 'r' } as never
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

    it('calls wallet.borrow.withdrawCollateral with fresh params', async () => {
      const receipt = { tag: 'w' } as never
      mockWalletBorrow.withdrawCollateral.mockResolvedValue(receipt)
      await borrowService.withdrawCollateral({
        idToken: 'idtok',
        marketId: baseMarketId,
        amount: { max: true },
      })
      expect(mockWalletBorrow.withdrawCollateral).toHaveBeenCalledWith({
        marketId: baseMarketId,
        amount: { max: true },
      })
    })

    it('forwards a pre-built quote unchanged', async () => {
      const quote = { action: 'withdrawCollateral' } as never
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

    it('calls wallet.borrow.repay with fresh params', async () => {
      const receipt = { tag: 'rep' } as never
      mockWalletBorrow.repay.mockResolvedValue(receipt)
      await borrowService.repay({
        idToken: 'idtok',
        marketId: baseMarketId,
        amount: { amount: 1 },
      })
      expect(mockWalletBorrow.repay).toHaveBeenCalledWith({
        marketId: baseMarketId,
        amount: { amount: 1 },
      })
    })

    it('forwards a pre-built quote unchanged', async () => {
      const quote = { action: 'repay' } as never
      mockWalletBorrow.repay.mockResolvedValue({} as never)
      await borrowService.repay({ idToken: 'idtok', quote })
      expect(mockWalletBorrow.repay).toHaveBeenCalledWith(quote)
    })
  })
})
