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

vi.mock('./mirror.js', () => ({
  mintMirrorUsdc: vi.fn(),
  removeMirrorUsdc: vi.fn(),
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
    MorphoUSDCBorrowOPDemo: {
      ...baseMarketId,
      name: 'Demo dUSDC / OP',
      collateralAsset: { metadata: { symbol: 'USDC_DEMO' } },
      borrowAsset: { metadata: { symbol: 'OP_DEMO' } },
      marketParams: {
        loanToken: '0x0',
        collateralToken: '0x0',
        oracle: '0x0',
        irm: '0x0',
        lltv: 0n,
      },
    },
    AaveETHBorrowUSDCDemo: {
      kind: 'aave-v3' as const,
      marketId: ('0x' + 'c'.repeat(64)) as `0x${string}`,
      chainId: 11155420 as never,
      name: 'Aave ETH / USDC',
      collateralAsset: { metadata: { symbol: 'ETH' } },
      borrowAsset: { metadata: { symbol: 'USDC' } },
      aave: {
        debtReserve: '0x0',
        collateralReserve: '0x0',
        collateralUsesWethGateway: true,
      },
    },
  }
})

const mockBorrowProvider = {
  getMarket: vi.fn(),
  getMarkets: vi.fn(),
  getPosition: vi.fn(),
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

    it('resolves the aave-v3 market by kind + id', () => {
      const result = borrowService.resolveMarketConfig({
        kind: 'aave-v3',
        marketId: ('0x' + 'C'.repeat(64)) as `0x${string}`,
        chainId: 11155420 as never,
      })
      expect(result.kind).toBe('aave-v3')
    })

    it('does not cross-match an aave id against a morpho-blue kind', () => {
      expect(() =>
        borrowService.resolveMarketConfig({
          kind: 'morpho-blue',
          marketId: ('0x' + 'c'.repeat(64)) as `0x${string}`,
          chainId: 11155420 as never,
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
  })

  describe('aave mirror integration', () => {
    const aaveMarketId = {
      kind: 'aave-v3' as const,
      marketId: ('0x' + 'c'.repeat(64)) as `0x${string}`,
      chainId: 11155420 as never,
    }

    beforeEach(async () => {
      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue(mockWallet as never)
    })

    it('mints USDC_DEMO after an aave borrow, with the realized amount', async () => {
      const { mintMirrorUsdc } = await import('./mirror.js')
      mockWalletBorrow.openPosition.mockResolvedValue({
        borrowAmount: 1_000_000n,
        transactionHash: '0xreal',
      } as unknown as BorrowReceipt)

      await borrowService.openPosition({
        idToken: 'idtok',
        marketId: aaveMarketId,
        borrowAmount: { amount: 1 },
      })
      expect(mintMirrorUsdc).toHaveBeenCalledWith(
        mockWallet,
        1_000_000n,
        '0xreal',
      )
    })

    it('removes USDC_DEMO after an aave repay', async () => {
      const { removeMirrorUsdc } = await import('./mirror.js')
      mockWalletBorrow.repay.mockResolvedValue({
        borrowAmount: 500_000n,
        transactionHash: '0xreal',
      } as unknown as BorrowReceipt)

      await borrowService.repay({
        idToken: 'idtok',
        marketId: aaveMarketId,
        amount: { amount: 0.5 },
      })
      expect(removeMirrorUsdc).toHaveBeenCalledWith(
        mockWallet,
        500_000n,
        '0xreal',
      )
    })

    it('removes USDC_DEMO after an aave close (full repay)', async () => {
      const { removeMirrorUsdc } = await import('./mirror.js')
      mockWalletBorrow.closePosition.mockResolvedValue({
        borrowAmount: 1_000_000n,
        transactionHash: '0xreal',
      } as unknown as BorrowReceipt)

      await borrowService.closePosition({
        idToken: 'idtok',
        marketId: aaveMarketId,
        borrowAmount: { max: true },
      })
      expect(removeMirrorUsdc).toHaveBeenCalledWith(
        mockWallet,
        1_000_000n,
        '0xreal',
      )
    })

    it('does NOT mirror a morpho borrow or repay (regression)', async () => {
      const { mintMirrorUsdc, removeMirrorUsdc } = await import('./mirror.js')
      mockWalletBorrow.openPosition.mockResolvedValue({
        borrowAmount: 1_000_000n,
        transactionHash: '0xreal',
      } as unknown as BorrowReceipt)
      mockWalletBorrow.repay.mockResolvedValue({
        borrowAmount: 1_000_000n,
        transactionHash: '0xreal',
      } as unknown as BorrowReceipt)

      await borrowService.openPosition({
        idToken: 'idtok',
        marketId: baseMarketId,
        borrowAmount: { amount: 1 },
      })
      await borrowService.repay({
        idToken: 'idtok',
        marketId: baseMarketId,
        amount: { amount: 1 },
      })
      expect(mintMirrorUsdc).not.toHaveBeenCalled()
      expect(removeMirrorUsdc).not.toHaveBeenCalled()
    })
  })
})
