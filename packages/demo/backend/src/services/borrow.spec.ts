import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as borrowService from './borrow.js'

vi.mock('../config/actions.js', () => ({
  getActions: vi.fn(),
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

describe('Borrow Service', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
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
})
