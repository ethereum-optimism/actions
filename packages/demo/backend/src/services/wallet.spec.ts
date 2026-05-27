import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as walletService from './wallet.js'

vi.mock('../config/actions.js', () => ({
  getActions: vi.fn(),
  getPrivyClient: vi.fn(),
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

const baseMarketId = {
  kind: 'morpho-blue' as const,
  marketId: ('0x' + 'a'.repeat(64)) as `0x${string}`,
  chainId: 84532 as never,
}

const walletAddress = '0xabcdef0123456789abcdef0123456789abcdef01' as const

describe('Wallet Service', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { getActions } = await import('../config/actions.js')
    vi.mocked(getActions).mockReturnValue(mockActions as never)
  })

  describe('getBorrowPosition', () => {
    it('calls actions.borrow.getPosition with the supplied marketId and walletAddress', async () => {
      const position = {
        borrowAmount: 0n,
        collateralAmount: 0n,
        healthFactor: Infinity,
      }
      mockBorrowProvider.getPosition.mockResolvedValue(position as never)

      const result = await walletService.getBorrowPosition({
        marketId: baseMarketId,
        walletAddress,
      })

      expect(mockBorrowProvider.getPosition).toHaveBeenCalledWith({
        marketId: baseMarketId,
        walletAddress,
      })
      expect(result).toEqual({
        borrowAmount: '0',
        collateralAmount: '0',
        healthFactor: null,
      })
    })

    it('serializes bigint fields in the position response', async () => {
      mockBorrowProvider.getPosition.mockResolvedValue({
        borrowAmount: 12345n,
        collateralAmount: 67890n,
      } as never)
      const result = await walletService.getBorrowPosition({
        marketId: baseMarketId,
        walletAddress,
      })
      expect(result).toEqual({
        borrowAmount: '12345',
        collateralAmount: '67890',
      })
    })

    it('propagates SDK errors', async () => {
      mockBorrowProvider.getPosition.mockRejectedValue(
        new Error('position read failed'),
      )
      await expect(
        walletService.getBorrowPosition({
          marketId: baseMarketId,
          walletAddress,
        }),
      ).rejects.toThrow('position read failed')
    })
  })
})
