import { serializeBigInt } from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import { z } from 'zod'

import { errorResponse, requireAuth } from '@/helpers/errors.js'
import {
  AddressSchema,
  AmountExactSchema,
  BorrowMarketIdSchema,
  ChainIdStringSchema,
} from '@/helpers/schemas.js'
import { validateRequest } from '@/helpers/validation.js'
import * as borrowService from '@/services/borrow.js'

/**
 * Quote bodies are passed opaquely to the SDK; we only enforce that the
 * action discriminator matches the route. Deep validation of the quote
 * shape is the SDK's responsibility at execute time.
 */
function quoteBodySchema(action: string) {
  return z.strictObject({
    quote: z
      .object({
        action: z.literal(action),
      })
      .passthrough(),
  })
}

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

// Quote body is strict so that an extra `recipient` field is rejected
// (rather than silently dropped). Per plan R1: recipient is derived from
// the authenticated idToken, never accepted from the request body.
const QuoteRequestSchema = z.object({
  body: z
    .object({
      action: BorrowActionSchema,
      marketId: BorrowMarketIdSchema,
      borrowAmount: AmountExactSchema.optional(),
      collateralAmount: AmountExactSchema.optional(),
    })
    .strict(),
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

/**
 * POST - Build a recipient-bound borrow quote (auth required). Recipient
 * is derived from the authenticated idToken; supplying a `recipient` in
 * the body is rejected with a 400 by the strict schema.
 */
export async function getQuote(c: Context) {
  try {
    const validation = await validateRequest(c, QuoteRequestSchema)
    if (!validation.success) return validation.response

    const authResult = requireAuth(c)
    if ('error' in authResult) return authResult.error

    const quote = await borrowService.getQuote({
      idToken: authResult.auth.idToken,
      ...validation.data.body,
    })
    return c.json({ result: serializeBigInt(quote) })
  } catch (error) {
    return errorResponse(c, 'Failed to get borrow quote', 500, error)
  }
}

// ---------- Mutations ----------

const OpenParamsBody = z.strictObject({
  marketId: BorrowMarketIdSchema,
  borrowAmount: AmountExactSchema,
  collateralAmount: AmountExactSchema.optional(),
  collateralAsset: AddressSchema,
})

const OpenRequestSchema = z.object({
  body: z.union([OpenParamsBody, quoteBodySchema('open')]),
})

/**
 * POST - Open a borrow position (Morpho variant). Body is either fresh
 * params or a pre-built quote with action='open'.
 */
export async function openPosition(c: Context) {
  try {
    const validation = await validateRequest(c, OpenRequestSchema)
    if (!validation.success) return validation.response

    const authResult = requireAuth(c)
    if ('error' in authResult) return authResult.error

    const result = await borrowService.openPosition({
      idToken: authResult.auth.idToken,
      ...validation.data.body,
    } as Parameters<typeof borrowService.openPosition>[0])
    return c.json({ result: serializeBigInt(result) })
  } catch (error) {
    return errorResponse(c, 'Failed to open borrow position', 500, error)
  }
}
