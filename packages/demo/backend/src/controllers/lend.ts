import type { SupportedChainId } from '@eth-optimism/verbs-sdk'
import type { Context } from 'hono'
import type { Address } from 'viem'
import { z } from 'zod'

import type { AuthContext } from '@/middleware/auth.js'

import { validateRequest } from '../helpers/validation.js'
import * as lendService from '../services/lend.js'

const OpenPositionRequestSchema = z.object({
  body: z.object({
    walletId: z.string().min(1, 'walletId is required'),
    amount: z.number().positive('amount must be positive'),
    tokenAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address format'),
    chainId: z.number().min(1, 'chainId is required'),
    vaultAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid vault address format'),
  }),
})

const ClosePositionRequestSchema = z.object({
  body: z.object({
    walletId: z.string().min(1, 'walletId is required'),
    amount: z.number().positive('amount must be positive'),
    tokenAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address format'),
    chainId: z.number().min(1, 'chainId is required'),
    vaultAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid vault address format'),
  }),
})

const MarketBalanceParamsSchema = z.object({
  params: z.object({
    vaultAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid vault address format'),
    walletId: z.string().min(1, 'walletId is required'),
    chainId: z.string().min(1, 'chainId is required'),
  }),
})

export class LendController {
  /**
   * GET - Retrieve all available lending markets
   */
  async getMarkets(c: Context) {
    try {
      const markets = await lendService.getMarkets()
      const formattedMarkets = await Promise.all(
        markets.map((market) => lendService.formatMarketResponse(market)),
      )
      return c.json({ markets: formattedMarkets })
    } catch (error) {
      return c.json(
        {
          error: 'Failed to get markets',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }

  /**
   * GET - Retrieve specific market information by ID and chain
   */
  async getMarket(c: Context) {
    try {
      const chainId = Number(c.req.param('chainId'))
      const marketId = c.req.param('marketId')

      if (!chainId || !marketId) {
        return c.json(
          {
            error: 'Invalid parameters',
            message: 'chainId and marketId are required',
          },
          400,
        )
      }

      const marketInfo = await lendService.getMarket(
        marketId as Address,
        chainId as SupportedChainId,
      )
      const formattedMarket = await lendService.formatMarketResponse(marketInfo)
      return c.json({ market: formattedMarket })
    } catch (error) {
      return c.json(
        {
          error: 'Failed to get market info',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }

  /**
   * GET - Get market balance for a specific wallet
   */
  async getMarketBalance(c: Context) {
    try {
      const validation = await validateRequest(c, MarketBalanceParamsSchema)
      if (!validation.success) return validation.response

      const {
        params: { vaultAddress, walletId, chainId },
      } = validation.data
      const balance = await lendService.getPosition(
        vaultAddress as Address,
        walletId,
        Number(chainId) as SupportedChainId,
      )
      const formattedBalance =
        await lendService.formatMarketBalanceResponse(balance)
      return c.json(formattedBalance)
    } catch (error) {
      return c.json(
        {
          error: 'Failed to get market balance',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }

  /**
   * POST - Open a lending position
   */
  async openPosition(c: Context) {
    try {
      const validation = await validateRequest(c, OpenPositionRequestSchema)
      if (!validation.success) return validation.response

      const {
        body: { walletId, amount, tokenAddress, chainId, vaultAddress },
      } = validation.data
      const auth = c.get('auth') as AuthContext | undefined

      const transaction = await lendService.openPosition({
        userId: auth?.userId || walletId,
        amount,
        tokenAddress: tokenAddress as Address,
        chainId: chainId as SupportedChainId,
        vaultAddress: vaultAddress as Address,
        isUserWallet: Boolean(auth?.userId),
      })

      return c.json({ transaction })
    } catch (error) {
      console.error('Failed to open position', error)
      return c.json(
        {
          error: 'Failed to open position',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }

  /**
   * POST - Close a lending position
   */
  async closePosition(c: Context) {
    try {
      const validation = await validateRequest(c, ClosePositionRequestSchema)
      if (!validation.success) return validation.response

      const {
        body: { walletId, amount, tokenAddress, chainId, vaultAddress },
      } = validation.data
      const auth = c.get('auth') as AuthContext | undefined

      const transaction = await lendService.closePosition({
        userId: auth?.userId || walletId,
        amount,
        tokenAddress: tokenAddress as Address,
        chainId: chainId as SupportedChainId,
        vaultAddress: vaultAddress as Address,
        isUserWallet: Boolean(auth?.userId),
      })

      return c.json({ transaction })
    } catch (error) {
      console.error('Failed to close position', error)
      return c.json(
        {
          error: 'Failed to close position',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }
}
