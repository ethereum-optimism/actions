import {
  SUPPORTED_CHAIN_IDS,
  type SupportedChainId,
} from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import type { Address } from 'viem'
import { z } from 'zod'

import { errorResponse, requireAuth } from '@/helpers/errors.js'
import { validateRequest } from '@/helpers/validation.js'
import * as swapService from '@/services/swap.js'
import { serializeBigInt } from '@/utils/serializers.js'

const supportedChainIds = SUPPORTED_CHAIN_IDS as readonly number[]
const providerEnum = z.enum(['uniswap', 'velodrome']).optional()

const chainIdFromString = z
  .string()
  .transform((v) => Number(v))
  .refine((v) => supportedChainIds.includes(v), 'Unsupported chain ID')

const chainIdFromNumber = z
  .number()
  .positive('chainId must be positive')
  .refine((v) => supportedChainIds.includes(v), 'Unsupported chain ID')

const PriceRequestSchema = z.object({
  query: z.object({
    tokenInAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address format'),
    tokenOutAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address format'),
    chainId: chainIdFromString,
    amountIn: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : undefined)),
    amountOut: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : undefined)),
    provider: z.string().optional().pipe(providerEnum),
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
    chainId: chainIdFromNumber,
    slippage: z.number().min(0).max(0.5).optional(),
    provider: providerEnum,
  }),
})

const GetMarketsRequestSchema = z.object({
  query: z.object({
    chainId: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : undefined))
      .refine(
        (v) => v === undefined || supportedChainIds.includes(v),
        'Unsupported chain ID',
      ),
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

    const markets = await swapService.getMarkets(
      chainId as SupportedChainId | undefined,
    )
    return c.json({ result: serializeBigInt(markets) })
  } catch (error) {
    return errorResponse(c, 'Failed to get swap markets', 500, error)
  }
}

/**
 * GET - Get price quote for a swap
 */
export async function getPrice(c: Context) {
  try {
    const validation = await validateRequest(c, PriceRequestSchema)
    if (!validation.success) return validation.response

    const {
      tokenInAddress,
      tokenOutAddress,
      chainId,
      amountIn,
      amountOut,
      provider,
    } = validation.data.query

    const price = await swapService.getPrice({
      tokenInAddress: tokenInAddress as Address,
      tokenOutAddress: tokenOutAddress as Address,
      chainId: chainId as SupportedChainId,
      amountIn,
      amountOut,
      provider,
    })

    return c.json({ result: serializeBigInt(price) })
  } catch (error) {
    return errorResponse(c, 'Failed to get swap price', 500, error)
  }
}

/**
 * POST - Execute a token swap
 */
export async function executeSwap(c: Context) {
  try {
    const validation = await validateRequest(c, ExecuteSwapRequestSchema)
    if (!validation.success) return validation.response

    const {
      amountIn,
      tokenInAddress,
      tokenOutAddress,
      chainId,
      slippage,
      provider,
    } = validation.data.body

    const authResult = requireAuth(c)
    if ('error' in authResult) return authResult.error

    const result = await swapService.executeSwap({
      idToken: authResult.auth.idToken,
      amountIn,
      tokenInAddress: tokenInAddress as Address,
      tokenOutAddress: tokenOutAddress as Address,
      chainId: chainId as SupportedChainId,
      slippage,
      provider,
    })

    return c.json({ result: serializeBigInt(result) })
  } catch (error) {
    return errorResponse(c, 'Failed to execute swap', 500, error)
  }
}
