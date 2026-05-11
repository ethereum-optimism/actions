import { serializeBigInt } from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import { z } from 'zod'

import { errorResponse } from '@/helpers/errors.js'
import {
  AddressSchema,
  AmountExactSchema,
  BorrowMarketIdSchema,
  ChainIdStringSchema,
} from '@/helpers/schemas.js'
import { validateRequest } from '@/helpers/validation.js'
import * as borrowService from '@/services/borrow.js'

const BorrowActionSchema = z.enum([
  'open',
  'close',
  'depositCollateral',
  'withdrawCollateral',
  'repay',
])

const GetMarketsRequestSchema = z.object({
  query: z.object({
    chainId: ChainIdStringSchema.optional(),
  }),
})

const PriceRequestSchema = z.object({
  body: z.object({
    action: BorrowActionSchema,
    marketId: BorrowMarketIdSchema,
    borrowAmount: AmountExactSchema.optional(),
    collateralAmount: AmountExactSchema.optional(),
    recipient: AddressSchema.optional(),
  }),
})

/**
 * GET - Retrieve borrow markets, optionally filtered by chain.
 */
export async function getMarkets(c: Context) {
  try {
    const validation = await validateRequest(c, GetMarketsRequestSchema)
    if (!validation.success) return validation.response

    const { chainId } = validation.data.query
    const markets = await borrowService.getMarkets(chainId ? { chainId } : {})
    return c.json({ result: serializeBigInt(markets) })
  } catch (error) {
    return errorResponse(c, 'Failed to get borrow markets', 500, error)
  }
}

/**
 * POST - Get a lightweight borrow price preview (positionAfter / fees /
 * safeCeilingLtv) without building executable calldata.
 */
export async function getPrice(c: Context) {
  try {
    const validation = await validateRequest(c, PriceRequestSchema)
    if (!validation.success) return validation.response

    const price = await borrowService.getPrice(validation.data.body)
    return c.json({ result: serializeBigInt(price) })
  } catch (error) {
    return errorResponse(c, 'Failed to get borrow price', 500, error)
  }
}
