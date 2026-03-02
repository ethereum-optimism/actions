import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as swapService from './swap.js'

vi.mock('../config/actions.js', () => ({
  getActions: vi.fn(),
}))

vi.mock('./wallet.js', () => ({
  getWallet: vi.fn(),
}))

vi.mock('../utils/assets.js', () => ({
  resolveAsset: vi.fn().mockImplementation((address: string) => ({
    type: 'erc20',
    address: { 84532: address },
    metadata: {
      name: address === '0x1111' ? 'USDC' : 'OP',
      symbol: address === '0x1111' ? 'USDC' : 'OP',
      decimals: address === '0x1111' ? 6 : 18,
    },
  })),
}))

const TOKEN_IN = '0x1111' as Address
const TOKEN_OUT = '0x2222' as Address
const CHAIN_ID = 84532 as SupportedChainId

const mockSwapNamespace = {
  getMarkets: vi.fn(),
  price: vi.fn(),
}

const mockActions = {
  swap: mockSwapNamespace,
}

describe('Swap Service', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { getActions } = await import('../config/actions.js')
    vi.mocked(getActions).mockReturnValue(mockActions as any)
  })

  describe('getMarkets', () => {
    it('returns markets from swap provider', async () => {
      const mockMarkets = [
        { marketId: { poolId: '0xpool', chainId: CHAIN_ID } },
      ]
      mockSwapNamespace.getMarkets.mockResolvedValue(mockMarkets)

      const result = await swapService.getMarkets(CHAIN_ID)

      expect(result).toEqual(mockMarkets)
      expect(mockSwapNamespace.getMarkets).toHaveBeenCalledWith({
        chainId: CHAIN_ID,
      })
    })

    it('passes empty params when no chainId', async () => {
      mockSwapNamespace.getMarkets.mockResolvedValue([])

      await swapService.getMarkets()

      expect(mockSwapNamespace.getMarkets).toHaveBeenCalledWith({})
    })
  })

  describe('getPrice', () => {
    it('returns price quote for exact-in', async () => {
      const mockPrice = {
        price: '0.005',
        amountIn: 100000000n,
        amountOut: 500000000000000000n,
      }
      mockSwapNamespace.price.mockResolvedValue(mockPrice)

      const result = await swapService.getPrice({
        tokenInAddress: TOKEN_IN,
        tokenOutAddress: TOKEN_OUT,
        chainId: CHAIN_ID,
        amountIn: 100,
      })

      expect(result).toEqual(mockPrice)
      expect(mockSwapNamespace.price).toHaveBeenCalledWith(
        expect.objectContaining({ amountIn: 100 }),
      )
    })

    it('passes amountOut for exact-out quotes', async () => {
      mockSwapNamespace.price.mockResolvedValue({ price: '200' })

      await swapService.getPrice({
        tokenInAddress: TOKEN_IN,
        tokenOutAddress: TOKEN_OUT,
        chainId: CHAIN_ID,
        amountOut: 0.5,
      })

      expect(mockSwapNamespace.price).toHaveBeenCalledWith(
        expect.objectContaining({ amountOut: 0.5 }),
      )
    })

    it('defaults amountIn to 1 when neither specified', async () => {
      mockSwapNamespace.price.mockResolvedValue({ price: '200' })

      await swapService.getPrice({
        tokenInAddress: TOKEN_IN,
        tokenOutAddress: TOKEN_OUT,
        chainId: CHAIN_ID,
      })

      expect(mockSwapNamespace.price).toHaveBeenCalledWith(
        expect.objectContaining({ amountIn: 1 }),
      )
    })
  })

  describe('executeSwap', () => {
    it('throws when wallet not found', async () => {
      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue(null as any)

      await expect(
        swapService.executeSwap({
          idToken: 'invalid',
          amountIn: 100,
          tokenInAddress: TOKEN_IN,
          tokenOutAddress: TOKEN_OUT,
          chainId: CHAIN_ID,
        }),
      ).rejects.toThrow('Wallet not found')
    })

    it('throws when swap not configured', async () => {
      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue({ swap: undefined } as any)

      await expect(
        swapService.executeSwap({
          idToken: 'valid',
          amountIn: 100,
          tokenInAddress: TOKEN_IN,
          tokenOutAddress: TOKEN_OUT,
          chainId: CHAIN_ID,
        }),
      ).rejects.toThrow('Swap not configured')
    })

    it('executes swap and returns receipt with explorer urls', async () => {
      const mockReceipt = {
        receipt: { transactionHash: '0xtxhash' },
        amountIn: 100000000n,
        amountOut: 500000000000000000n,
        price: '0.005',
        priceImpact: 0.001,
        assetIn: {},
        assetOut: {},
        amountInFormatted: '100',
        amountOutFormatted: '0.5',
      }

      const { getWallet } = await import('./wallet.js')
      vi.mocked(getWallet).mockResolvedValue({
        swap: { execute: vi.fn().mockResolvedValue(mockReceipt) },
      } as any)

      const result = await swapService.executeSwap({
        idToken: 'valid',
        amountIn: 100,
        tokenInAddress: TOKEN_IN,
        tokenOutAddress: TOKEN_OUT,
        chainId: CHAIN_ID,
      })

      expect(result.amountIn).toBe(100000000n)
      expect(result.blockExplorerUrls).toBeDefined()
    })
  })
})
