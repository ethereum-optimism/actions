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
    walletId: z.string().min(1, 'walletId is required'),
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

const OpenPositionV1RequestSchema = z.object({
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

const ClosePositionV1RequestSchema = z.object({
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
    walletId: z.string().min(1, 'walletId is required'),
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

const MarketBalanceParamsSchema = z.object({
  params: z.object({
    marketAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid market address format'),
    walletId: z.string().min(1, 'walletId is required'),
    chainId: z.string().min(1, 'chainId is required'),
  }),
})

/**
 * GET - Retrieve all available lending markets
 */
export async function getMarkets(c: Context) {
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
 * GET - Retrieve all available lending markets
 */
export async function getMarketsV1(c: Context) {
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
 * GET - Retrieve specific market information by ID and chain
 */
export async function getMarket(c: Context) {
  try {
    const chainId = Number(c.req.param('chainId'))
    const marketAddress = c.req.param('marketAddress')

    if (!chainId || !marketAddress) {
      return c.json(
        {
          error: 'Invalid parameters',
          message: 'chainId and marketAddress are required',
        },
        400,
      )
    }

    const marketInfo = await lendService.getMarket({
      address: marketAddress as Address,
      chainId: chainId as SupportedChainId,
    })
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
 * GET - Get position for a specific wallet
 */
export async function getPosition(c: Context) {
  try {
    const validation = await validateRequest(c, MarketBalanceParamsSchema)
    if (!validation.success) return validation.response

    const {
      params: { marketAddress, walletId, chainId },
    } = validation.data
    const balance = await lendService.getPosition(
      {
        address: marketAddress as Address,
        chainId: Number(chainId) as SupportedChainId,
      },
      walletId,
    )
    const formattedBalance =
      await lendService.formatMarketBalanceResponse(balance)
    return c.json(formattedBalance)
  } catch (error) {
    return c.json(
      {
        error: 'Failed to get position',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    )
  }
}

/**
 *
 */
export async function openPositionV1(c: Context) {
  try {
    const validation = await validateRequest(c, OpenPositionV1RequestSchema)
    if (!validation.success) return validation.response

    const {
      body: { amount, tokenAddress, marketId },
    } = validation.data
    const auth = c.get('auth') as AuthContext | undefined
    if (!auth || !auth.userId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const result = await lendService.openPositionV1({
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
 * POST - Open a lending position
 */
export async function openPosition(c: Context) {
  try {
    const validation = await validateRequest(c, OpenPositionRequestSchema)
    if (!validation.success) return validation.response

    // TODO (https://github.com/ethereum-optimism/actions/issues/124): enforce auth and clean

    const {
      body: { walletId, amount, tokenAddress, marketId },
    } = validation.data
    const auth = c.get('auth') as AuthContext | undefined

    const transaction = await lendService.openPosition({
      userId: auth?.userId || walletId,
      amount,
      tokenAddress: tokenAddress as Address,
      marketId: {
        address: marketId.address as Address,
        chainId: marketId.chainId as SupportedChainId,
      },
      isUserWallet: Boolean(auth?.userId),
    })

    return c.json({ transaction })
  } catch (error) {
    console.error('[openPosition] ERROR:', {
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
export async function closePositionV1(c: Context) {
  try {
    const validation = await validateRequest(c, ClosePositionV1RequestSchema)
    if (!validation.success) return validation.response

    const {
      body: { amount, tokenAddress, marketId },
    } = validation.data
    const auth = c.get('auth') as AuthContext | undefined
    if (!auth || !auth.userId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const result = await lendService.closePositionV1({
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

/**
 * POST - Close a lending position
 */
export async function closePosition(c: Context) {
  try {
    const validation = await validateRequest(c, ClosePositionRequestSchema)
    if (!validation.success) return validation.response

    const {
      body: { walletId, amount, tokenAddress, marketId },
    } = validation.data
    const auth = c.get('auth') as AuthContext | undefined

    const transaction = await lendService.closePosition({
      userId: auth?.userId || walletId,
      amount,
      tokenAddress: tokenAddress as Address,
      marketId: {
        address: marketId.address as Address,
        chainId: marketId.chainId as SupportedChainId,
      },
      isUserWallet: Boolean(auth?.userId),
    })

    return c.json({ transaction })
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
