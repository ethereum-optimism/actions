import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import type { Address } from 'viem'
import { z } from 'zod'

import type { AuthContext } from '@/middleware/auth.js'
import { serializeBigInt } from '@/utils/serializers.js'

import { validateRequest } from '../helpers/validation.js'
import * as lendService from '../services/lend.js'

const OpenPositionRequestSchema = z.object({
  body: z.object({
    amount: z.number().positive('amount must be positive'),
    tokenAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address format'),
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
    tokenAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address format'),
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
 *
 */
export async function openPosition(c: Context) {
  try {
    const validation = await validateRequest(c, OpenPositionRequestSchema)
    if (!validation.success) return validation.response

    const {
      body: { amount, tokenAddress, marketId },
    } = validation.data
    const auth = c.get('auth') as AuthContext | undefined
    if (!auth || !auth.userId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const result = await lendService.openPosition({
      userId: auth.userId,
      amount,
      tokenAddress: tokenAddress as Address,
      marketId: {
        address: marketId.address as Address,
        chainId: marketId.chainId as SupportedChainId,
      },
      isUserWallet: Boolean(auth?.userId),
    })

    return c.json({ result: serializeBigInt(result) })
  } catch (error) {
    console.error('[openPositionV1] ERROR:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
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
export async function closePosition(c: Context) {
  try {
    const validation = await validateRequest(c, ClosePositionRequestSchema)
    if (!validation.success) return validation.response

    const {
      body: { amount, tokenAddress, marketId },
    } = validation.data
    const auth = c.get('auth') as AuthContext | undefined
    if (!auth || !auth.userId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const result = await lendService.closePosition({
      userId: auth.userId,
      amount,
      tokenAddress: tokenAddress as Address,
      marketId: {
        address: marketId.address as Address,
        chainId: marketId.chainId as SupportedChainId,
      },
      isUserWallet: Boolean(auth?.userId),
    })

    return c.json({ result: serializeBigInt(result) })
  } catch (error) {
    console.error('[closePosition] ERROR:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
    return c.json(
      {
        error: 'Failed to close position',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    )
  }
}
