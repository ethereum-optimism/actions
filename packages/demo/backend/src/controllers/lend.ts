import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import type { Address } from 'viem'
import { z } from 'zod'

import { errorResponse, requireAuth } from '@/helpers/errors.js'
import { validateRequest } from '@/helpers/validation.js'
import * as lendService from '@/services/lend.js'
import { serializeBigInt } from '@/utils/serializers.js'

const tokenAddressSchema = z
  .string()
  .refine(
    (val) => val === 'native' || /^0x[a-fA-F0-9]{40}$/.test(val),
    'Must be a hex address or "native"',
  )

const OpenPositionRequestSchema = z.object({
  body: z.object({
    amount: z.number().positive('amount must be positive'),
    tokenAddress: tokenAddressSchema,
    marketId: z.object({
      address: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid market address format'),
      chainId: z.number().positive('chainId must be positive'),
    }),
  }),
})

const ClosePositionRequestSchema = z.object({
  body: z.object({
    amount: z.number().positive('amount must be positive'),
    tokenAddress: tokenAddressSchema,
    marketId: z.object({
      address: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid market address format'),
      chainId: z.number().positive('chainId must be positive'),
    }),
  }),
})

/**
 * GET - Retrieve all available lending markets
 */
export async function getMarkets(c: Context) {
  try {
    const markets = await lendService.getMarkets()
    return c.json({ result: serializeBigInt(markets) })
  } catch (error) {
    return errorResponse(c, 'Failed to get markets', 500, error)
  }
}

/**
 * POST - Open a lending position
 */
export async function openPosition(c: Context) {
  try {
    const validation = await validateRequest(c, OpenPositionRequestSchema)
    if (!validation.success) return validation.response

    const {
      body: { amount, tokenAddress, marketId },
    } = validation.data

    const authResult = requireAuth(c)
    if ('error' in authResult) return authResult.error

    const result = await lendService.openPosition({
      idToken: authResult.auth.idToken,
      amount,
      tokenAddress: tokenAddress as Address,
      marketId: {
        address: marketId.address as Address,
        chainId: marketId.chainId as SupportedChainId,
      },
    })

    return c.json({ result: serializeBigInt(result) })
  } catch (error) {
    return errorResponse(c, 'Failed to open position', 500, error)
  }
}

/**
 * POST - Close a lending position
 */
export async function closePosition(c: Context) {
  try {
    const validation = await validateRequest(c, ClosePositionRequestSchema)
    if (!validation.success) return validation.response

    const {
      body: { amount, tokenAddress, marketId },
    } = validation.data

    const authResult = requireAuth(c)
    if ('error' in authResult) return authResult.error

    const result = await lendService.closePosition({
      idToken: authResult.auth.idToken,
      amount,
      tokenAddress: tokenAddress as Address,
      marketId: {
        address: marketId.address as Address,
        chainId: marketId.chainId as SupportedChainId,
      },
    })

    return c.json({ result: serializeBigInt(result) })
  } catch (error) {
    return errorResponse(c, 'Failed to close position', 500, error)
  }
}
