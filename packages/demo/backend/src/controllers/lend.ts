import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import type { Address } from 'viem'
import { z } from 'zod'

import type { AuthContext } from '@/middleware/auth.js'

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
  const requestId = Math.random().toString(36).substring(7)
  console.log(`[${new Date().toISOString()}] [${requestId}] getMarkets - START`)
  try {
    const markets = await lendService.getMarkets()
    console.log(
      `[${requestId}] getMarkets - SUCCESS, returning ${markets.length} markets`,
    )
    console.log(
      `[${requestId}] getMarkets - Markets:`,
      JSON.stringify(markets, null, 2),
    )
    return c.json({ result: markets })
  } catch (error) {
    console.error(`[${requestId}] getMarkets - ERROR:`, {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
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
 * POST - Open a lending position
 */
export async function openPosition(c: Context) {
  const requestId = Math.random().toString(36).substring(7)
  console.log(
    `[${new Date().toISOString()}] [${requestId}] openPosition - START`,
  )
  try {
    const validation = await validateRequest(c, OpenPositionRequestSchema)
    if (!validation.success) {
      console.log(`[${requestId}] openPosition - VALIDATION FAILED`)
      return validation.response
    }

    const {
      body: { amount, tokenAddress, marketId },
    } = validation.data

    console.log(
      `[${requestId}] openPosition - Amount: ${amount}, Token: ${tokenAddress}, Market: ${marketId.address} on chain ${marketId.chainId}`,
    )

    const auth = c.get('auth') as AuthContext | undefined
    if (!auth || !auth.idToken) {
      console.log(`[${requestId}] openPosition - UNAUTHORIZED`)
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const result = await lendService.openPosition({
      idToken: auth.idToken,
      amount,
      tokenAddress: tokenAddress as Address,
      marketId: {
        address: marketId.address as Address,
        chainId: marketId.chainId as SupportedChainId,
      },
    })

    console.log(`[${requestId}] openPosition - SUCCESS`)
    return c.json({ result })
  } catch (error) {
    console.error(`[${requestId}] openPosition - ERROR:`, {
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
  const requestId = Math.random().toString(36).substring(7)
  console.log(
    `[${new Date().toISOString()}] [${requestId}] closePosition - START`,
  )
  try {
    const validation = await validateRequest(c, ClosePositionRequestSchema)
    if (!validation.success) {
      console.log(`[${requestId}] closePosition - VALIDATION FAILED`)
      return validation.response
    }

    const {
      body: { amount, tokenAddress, marketId },
    } = validation.data

    console.log(
      `[${requestId}] closePosition - Amount: ${amount}, Token: ${tokenAddress}, Market: ${marketId.address} on chain ${marketId.chainId}`,
    )

    const auth = c.get('auth') as AuthContext | undefined
    if (!auth || !auth.idToken) {
      console.log(`[${requestId}] closePosition - UNAUTHORIZED`)
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const result = await lendService.closePosition({
      idToken: auth.idToken,
      amount,
      tokenAddress: tokenAddress as Address,
      marketId: {
        address: marketId.address as Address,
        chainId: marketId.chainId as SupportedChainId,
      },
    })

    console.log(`[${requestId}] closePosition - SUCCESS`)
    return c.json({ result })
  } catch (error) {
    console.error(`[${requestId}] closePosition - ERROR:`, {
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
