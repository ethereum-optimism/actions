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

const mockActions = {
  borrow: mockBorrowProvider,
}

const mockWalletAddress = '0xabcdef0123456789abcdef0123456789abcdef01'

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
})
