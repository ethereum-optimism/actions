import type { SupportedChainId } from '@eth-optimism/verbs-sdk'
import type { Context } from 'hono'
import type { Address } from 'viem'
import { z } from 'zod'

import { validateRequest } from '../helpers/validation.js'
import * as lendService from '../services/lend.js'
import { serializeBigInt } from '../utils/serializers.js'

const DepositRequestSchema = z.object({
  body: z.object({
    walletAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address format')
      .trim(),
    amount: z.number().positive('amount must be positive'),
    tokenAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address format'),
    chainId: z.number().min(1, 'chainId is required'),
  }),
})

const MarketBalanceParamsSchema = z.object({
  params: z.object({
    vaultAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid vault address format'),
    walletAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address format')
      .trim(),
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
        params: { vaultAddress, walletAddress },
      } = validation.data
      const balance = await lendService.getMarketBalance(
        vaultAddress as Address,
        walletAddress as Address,
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
   * POST - Deposit tokens into a lending vault
   */
  async deposit(c: Context) {
    try {
      const validation = await validateRequest(c, DepositRequestSchema)
      if (!validation.success) return validation.response

      const {
        body: { walletAddress, amount, tokenAddress, chainId },
      } = validation.data
      const lendTransaction = await lendService.deposit(
        walletAddress as Address,
        amount,
        tokenAddress as Address,
        chainId as SupportedChainId,
      )
      const result = await lendService.executeLendTransaction(
        walletAddress as Address,
        lendTransaction,
        chainId as SupportedChainId,
      )

      return c.json({
        transaction: {
          blockExplorerUrl: result.blockExplorerUrl,
          hash: result.hash,
          amount: result.amount.toString(),
          asset: result.asset,
          marketId: result.marketId,
          apy: result.apy,
          timestamp: result.timestamp,
          slippage: result.slippage,
          transactionData: serializeBigInt(result.transactionData),
        },
      })
    } catch (error) {
      console.error('Failed to deposit', error)
      return c.json(
        {
          error: 'Failed to deposit',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }
}
