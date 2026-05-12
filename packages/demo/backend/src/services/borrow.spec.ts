import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as borrowService from './borrow.js'

vi.mock('../config/actions.js', () => ({
  getActions: vi.fn(),
}))

vi.mock('./wallet.js', () => ({
  getWallet: vi.fn(),
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

    it('propagates errors from the SDK', async () => {
      mockBorrowProvider.getMarkets.mockRejectedValue(new Error('rpc down'))
      await expect(borrowService.getMarkets()).rejects.toThrow('rpc down')
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
      const receipt = { tag: 'open-receipt' } as never
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
      const receipt = { tag: 'q-receipt' } as never
      mockWalletBorrow.openPosition.mockResolvedValue(receipt)

      const result = await borrowService.openPosition({
        idToken: 'idtok',
        quote,
      })

      expect(mockWalletBorrow.openPosition).toHaveBeenCalledWith(quote)
      expect(result).toEqual({ ...receipt, blockExplorerUrls: [] })
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

    it('calls wallet.borrow.closePosition with resolved market', async () => {
      const receipt = { tag: 'close' } as never
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
      const receipt = { tag: 'r' } as never
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
      const receipt = { tag: 'dep' } as never
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

    it('calls wallet.borrow.withdrawCollateral with resolved market', async () => {
      const receipt = { tag: 'w' } as never
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
      const receipt = { tag: 'rep' } as never
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
