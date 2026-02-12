import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import type { Address } from 'viem'
import { z } from 'zod'

import type { AuthContext } from '@/middleware/auth.js'
import { serializeBigInt } from '@/utils/serializers.js'

import { validateRequest } from '../helpers/validation.js'
import * as swapService from '../services/swap.js'

const PriceRequestSchema = z.object({
  query: z.object({
    tokenInAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address format'),
    tokenOutAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address format'),
    chainId: z.string().transform((v) => Number(v)),
    amountIn: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : undefined)),
  }),
})

const ExecuteSwapRequestSchema = z.object({
  body: z.object({
    amountIn: z.number().positive('amountIn must be positive'),
    tokenInAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address format'),
    tokenOutAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address format'),
    chainId: z.number().positive('chainId must be positive'),
    slippage: z.number().min(0).max(1).optional(),
  }),
})

const GetMarketsRequestSchema = z.object({
  query: z.object({
    chainId: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : undefined)),
  }),
})

/**
 * GET - Retrieve all available swap markets
 */
export async function getMarkets(c: Context) {
  try {
    const validation = await validateRequest(c, GetMarketsRequestSchema)
    if (!validation.success) return validation.response

    const { chainId } = validation.data.query

    const markets = await swapService.getMarkets(chainId as SupportedChainId)
    return c.json({ result: serializeBigInt(markets) })
  } catch (error) {
    return c.json(
      {
        error: 'Failed to get swap markets',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    )
  }
}

/**
 * GET - Get price quote for a swap
 */
export async function getPrice(c: Context) {
  try {
    const validation = await validateRequest(c, PriceRequestSchema)
    if (!validation.success) return validation.response

    const { tokenInAddress, tokenOutAddress, chainId, amountIn } =
      validation.data.query

    const price = await swapService.getPrice({
      tokenInAddress: tokenInAddress as Address,
      tokenOutAddress: tokenOutAddress as Address,
      chainId: chainId as SupportedChainId,
      amountIn,
    })

    return c.json({ result: serializeBigInt(price) })
  } catch (error) {
    console.error('[getPrice] ERROR:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return c.json(
      {
        error: 'Failed to get swap price',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    )
  }
}

/**
 * POST - Execute a token swap
 */
export async function executeSwap(c: Context) {
  try {
    const validation = await validateRequest(c, ExecuteSwapRequestSchema)
    if (!validation.success) return validation.response

    const { amountIn, tokenInAddress, tokenOutAddress, chainId, slippage } =
      validation.data.body

    const auth = c.get('auth') as AuthContext | undefined
    if (!auth || !auth.idToken) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const result = await swapService.executeSwap({
      idToken: auth.idToken,
      amountIn,
      tokenInAddress: tokenInAddress as Address,
      tokenOutAddress: tokenOutAddress as Address,
      chainId: chainId as SupportedChainId,
      slippage,
    })

    return c.json({ result: serializeBigInt(result) })
  } catch (error) {
    console.error('[executeSwap] ERROR:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    return c.json(
      {
        error: 'Failed to execute swap',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    )
  }
}
