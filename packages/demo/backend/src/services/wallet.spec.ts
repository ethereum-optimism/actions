import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as usdcDemo from './usdcDemo.js'
import * as walletService from './wallet.js'

vi.mock('../config/actions.js', () => ({
  getActions: vi.fn(),
  getPrivyClient: vi.fn(),
}))

vi.mock('./usdcDemo.js', () => ({
  mintUsdcDemo: vi.fn(),
  transferUsdcDemo: vi.fn(),
}))

vi.mock('../utils/explorers.js', () => ({
  getBlockExplorerUrls: vi.fn(() => []),
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

  describe('getLendPositions', () => {
    it('forwards params to wallet.lend.getPositions and serializes bigints', async () => {
      const getPositions = vi.fn().mockResolvedValue([
        {
          balance: 1234567n,
          balanceFormatted: '1.234567',
          shares: 1000000n,
          sharesFormatted: '1.0',
          marketId: { address: '0xabc', chainId: 84532 },
        },
      ])
      const wallet = { lend: { getPositions } }

      const result = await walletService.getLendPositions({
        wallet: wallet as never,
        params: {
          chainId: 84532 as never,
          options: { nonZeroOnly: true },
        },
      })

      expect(getPositions).toHaveBeenCalledWith({
        chainId: 84532,
        options: { nonZeroOnly: true },
      })
      expect(result).toEqual([
        {
          balance: '1234567',
          balanceFormatted: '1.234567',
          shares: '1000000',
          sharesFormatted: '1.0',
          marketId: { address: '0xabc', chainId: 84532 },
        },
      ])
    })

    it('propagates SDK errors', async () => {
      const wallet = {
        lend: {
          getPositions: vi
            .fn()
            .mockRejectedValue(new Error('positions failed')),
        },
      }
      await expect(
        walletService.getLendPositions({
          wallet: wallet as never,
          params: {},
        }),
      ).rejects.toThrow('positions failed')
    })
  })

  describe('mintDemoUsdcToWallet', () => {
    it('mints exactly 100 USDC_DEMO (100_000_000n) to the wallet address', async () => {
      const wallet = { address: walletAddress } as never
      vi.mocked(usdcDemo.mintUsdcDemo).mockResolvedValue({
        userOpHash: `0x${'a'.repeat(64)}`,
      } as never)

      const result = await walletService.mintDemoUsdcToWallet(wallet)

      // Amount is a server-fixed integer constant, not a parseFloat path.
      expect(usdcDemo.mintUsdcDemo).toHaveBeenCalledWith(
        wallet,
        walletAddress,
        100_000_000n,
      )
      expect(result.amount).toBe('100')
      expect(result.to).toBe(walletAddress)
    })
  })
})
